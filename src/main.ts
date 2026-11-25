import "./styles.css";

// Placeholder shell. The agent loop, key entry, and inspector land in later PRs (see ROADMAP.md).
export function renderShell(root: HTMLElement): void {
  root.replaceChildren();

  const heading = document.createElement("h1");
  heading.textContent = "Context Discovery";

  const tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent = "See what an AI agent actually sends and receives, one API call at a time.";

  const status = document.createElement("p");
  status.className = "status";
  status.textContent = "Under construction. The live agent isn't wired up yet.";

  root.append(heading, tagline, status);
}

const root = document.getElementById("app");
if (root) renderShell(root);
