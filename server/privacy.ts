// The privacy page the collector serves at /privacy, linked from the menu's share-replays switch.
// It says what the replay upload (src/app/replayUpload.ts) sends, what the collector keeps
// (server/replayShelf.ts, server/collector.ts) and for how long; change it with them.
// Node runs this file as is (type stripping).

import { KEEP_DAYS } from './replayShelf.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The page, in English and Chinese. `contact` (PRIVACY_CONTACT) is who to write to. */
export function privacyPage(contact?: string): string {
  const who = contact?.trim() ? esc(contact.trim()) : '';
  const en = `
<h1>Hexfront Rush: match replays and privacy</h1>
<p>When you play a match against the computer, the game can send a replay of it so we can see how matches really go: which cards get flipped, what gets built, how long matches last and who wins. This is how the game gets balanced and its bugs found.</p>
<h2>What is sent</h2>
<ul>
<li>The match itself: its random seed, the cards you flipped and when, and how it ended (won, lost, drawn or left).</li>
<li>A random id made for that one match only, so a later copy of the same match replaces the earlier one. It is not stored on your device, and no two matches can be linked by it.</li>
<li>The game's build number and the site it runs on (for example "playgama").</li>
</ul>
<p>Nothing else: no name, no account, no device id, no cookie, no location.</p>
<h2>Your address</h2>
<p>Your IP address reaches our server with the request, as with any web request. It is held in memory only, for at most 10 minutes, to stop one sender from flooding the server, and it is never written down. The requests pass through Cloudflare, which carries them to our server.</p>
<h2>How long</h2>
<p>Each replay is deleted ${KEEP_DAYS} days after it arrives, or sooner when the space runs out. Replays are used only to improve the game and are not shared or sold.</p>
<h2>Turning it off</h2>
<p>Untick "Share my match replays" in the game's menu, and the game sends nothing more. Since a replay carries nothing that points to you, we cannot find "your" replays later to delete them; they go after ${KEEP_DAYS} days anyway.</p>
${who ? `<p>Questions: ${who}</p>` : ''}`;
  const zh = `
<h1>Hexfront Rush：对局录像与隐私</h1>
<p>你和电脑对战时，游戏可以发送这局的录像，让我们看到对局的真实情况：翻了哪些牌、造了什么、一局打多久、谁赢了。游戏的平衡调整和找 bug 就靠这些。</p>
<h2>发送的内容</h2>
<ul>
<li>对局本身：随机种子、你翻的牌和时间、结果（胜、负、平或离开）。</li>
<li>只为这一局生成的随机编号，同一局后来的副本会覆盖之前的。它不保存在你的设备上，不同对局之间无法通过它关联。</li>
<li>游戏的版本号和运行的网站（例如 "playgama"）。</li>
</ul>
<p>除此之外什么都没有：没有名字、账号、设备编号、cookie 或位置。</p>
<h2>你的地址</h2>
<p>和所有网页请求一样，你的 IP 地址会随请求到达我们的服务器。它只保存在内存里，最多 10 分钟，用于防止单个来源刷爆服务器，从不写入存储。请求经由 Cloudflare 转到我们的服务器。</p>
<h2>保存多久</h2>
<p>每份录像在到达 ${KEEP_DAYS} 天后删除，空间不足时更早。录像只用于改进游戏，不分享也不出售。</p>
<h2>关闭</h2>
<p>在游戏菜单里取消勾选"匿名分享我的对局录像"，游戏就不再发送。录像里没有任何指向你的信息，所以我们事后无法找出"你的"录像来删除；它们 ${KEEP_DAYS} 天后都会删除。</p>
${who ? `<p>联系：${who}</p>` : ''}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hexfront Rush privacy</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:680px;margin:0 auto;padding:16px;color:#1f2937;background:#fff}h1{font-size:1.4em}h2{font-size:1.1em;margin-top:1.4em}hr{margin:2em 0;border:0;border-top:1px solid #ddd}@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#111827}hr{border-top-color:#374151}}</style>
</head><body>${en}<hr lang="zh">${zh}</body></html>
`;
}
