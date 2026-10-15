import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "../App";

// Trademark guard: nothing a player can see may name the Tetris game or its pieces.
const BANNED = /tetri|tetro/i;

const { sdkStubs } = vi.hoisted(() => {
  const noop = () => {};
  return {
    sdkStubs: {
      sounds: { playMove: noop, playDrop: noop, playClear: noop, playLevelUp: noop, playGameOver: noop },
      leaderboard: { submitScore: noop, topScores: [], recentScores: [], loading: false },
    },
  };
});

vi.mock("@freegamestore/games", async () => {
  const React = await import("react");
  return {
    GameShell: ({ topbar, children }: { topbar: React.ReactNode; children: React.ReactNode }) =>
      React.createElement("div", null, topbar, children),
    GameTopbar: ({ title, rules }: { title: string; rules?: React.ReactNode }) =>
      React.createElement("header", null, React.createElement("h1", null, title), rules),
    GameAuth: () => null,
    useGameSounds: () => sdkStubs.sounds,
    useLeaderboard: () => sdkStubs.leaderboard,
  };
});

const web = resolve(__dirname, "../..");

describe("visible text", () => {
  it("rendered game never names Tetris or its pieces", () => {
    const { container, unmount } = render(<App />);
    const texts = [container.textContent ?? "", document.title];
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) texts.push(attr.value);
    }
    for (const text of texts) expect(text).not.toMatch(BANNED);
    expect(container.textContent).toContain("Falling Blocks");
    unmount();
  });

  it("index.html title does not name Tetris", () => {
    const html = readFileSync(resolve(web, "index.html"), "utf-8");
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    expect(title).toContain("Falling Blocks");
    expect(title).not.toMatch(BANNED);
  });

  it("PWA manifest name, short_name and description do not name Tetris", () => {
    const config = readFileSync(resolve(web, "vite.config.ts"), "utf-8");
    const manifest = config.match(/manifest:\s*\{([\s\S]*?)icons:/)?.[1] ?? "";
    expect(manifest).toContain("name: 'Falling Blocks'");
    expect(manifest).not.toMatch(BANNED);
  });
});
