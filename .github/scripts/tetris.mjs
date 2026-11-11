// Gera um SVG animado de "Tetris" a partir do gráfico de contribuições do GitHub.
// Sem dependências: usa apenas o Node 18+ (fetch nativo).
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GITHUB_USER || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const DEMO = process.env.DEMO === "1"; // modo de teste local, com dados aleatórios

const CELL = 12, GAP = 3, STEP = CELL + GAP, PAD = 16, FALL = 110, ROWS = 7;

// Cores clássicas das peças do Tetris (I, O, T, S, Z, J, L)
const PIECE_COLORS = ["#2ac3de", "#e0af68", "#bb9af7", "#9ece6a", "#f7768e", "#7aa2f7", "#ff9e64"];

const THEMES = {
  light: { empty: "#ebedf0", frame: "#d0d7de" },
  dark: { empty: "#21262d", frame: "#30363d" },
};

async function fetchGrid() {
  if (DEMO) {
    return Array.from({ length: 53 }, () =>
      Array.from({ length: ROWS }, () => (Math.random() < 0.45 ? 1 + Math.floor(Math.random() * 6) : 0))
    );
  }
  if (!USER || !TOKEN) throw new Error("Defina GITHUB_USER e GITHUB_TOKEN.");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "tetris-contrib" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) throw new Error("Falha ao ler contribuições: " + JSON.stringify(json));
  return weeks.map((w) => {
    const col = Array(ROWS).fill(0);
    for (const d of w.contributionDays) col[d.weekday] = d.contributionCount;
    return col;
  });
}

// Agrupa células com contribuição em "peças" de até 4 blocos conectados.
function buildPieces(grid) {
  const cols = grid.length;
  const taken = grid.map((c) => c.map(() => false));
  const pieces = [];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let c = 0; c < cols; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[c][r] <= 0 || taken[c][r]) continue;
      const cells = [[c, r]];
      taken[c][r] = true;
      while (cells.length < 4) {
        let found = null;
        outer: for (const [cc, rr] of cells) {
          for (const [dc, dr] of dirs) {
            const nc = cc + dc, nr = rr + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < ROWS && grid[nc][nr] > 0 && !taken[nc][nr]) {
              found = [nc, nr];
              break outer;
            }
          }
        }
        if (!found) break;
        taken[found[0]][found[1]] = true;
        cells.push(found);
      }
      pieces.push(cells);
    }
  }
  return pieces;
}

function render(grid, pieces, theme) {
  const cols = grid.length;
  const W = PAD * 2 + cols * STEP - GAP;
  const gy = PAD + FALL;
  const H = gy + ROWS * STEP - GAP + PAD;
  const n = Math.max(pieces.length, 1);
  const step = Math.min(0.15, 12 / n);
  const D = n * step + 8;
  const fallPct = (0.9 / D) * 100;
  const startY = gy + STEP;
  const pct = (v) => v.toFixed(3);

  let css = `.empty{fill:${theme.empty}}.frame{fill:none;stroke:${theme.frame};stroke-width:1}`;
  let body = "";

  // Fundo: grade vazia
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < ROWS; r++)
      body += `<rect class="empty" x="${PAD + c * STEP}" y="${gy + r * STEP}" width="${CELL}" height="${CELL}" rx="2"/>`;

  // Peças
  pieces.forEach((cells, i) => {
    const s = ((i * step) / D) * 100;
    const e = s + fallPct;
    const color = PIECE_COLORS[i % PIECE_COLORS.length];
    css += `.p${i}{animation:k${i} ${D.toFixed(2)}s linear infinite}`;
    css += `@keyframes k${i}{0%{opacity:0;transform:translateY(-${startY}px)}${pct(s)}%{opacity:1;transform:translateY(-${startY}px);animation-timing-function:cubic-bezier(.45,0,1,1)}${pct(e)}%{opacity:1;transform:translateY(0)}93%{opacity:1;transform:translateY(0)}97%,100%{opacity:0;transform:translateY(0)}}`;
    body += `<g class="p${i}">`;
    for (const [c, r] of cells) {
      const x = PAD + c * STEP, y = gy + r * STEP;
      body += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`;
      body += `<rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="1" fill="#fff" fill-opacity=".18"/>`;
    }
    body += `</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tetris com as contribuições do GitHub"><style>${css}</style>${body}</svg>`;
}

const grid = await fetchGrid();
const pieces = buildPieces(grid);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/github-tetris.svg", render(grid, pieces, THEMES.light));
writeFileSync("dist/github-tetris-dark.svg", render(grid, pieces, THEMES.dark));
console.log(`OK: ${pieces.length} peças geradas.`);