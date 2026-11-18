// Onboarding Tracker – Text Expander feed + notification
//
// Paste this whole file over Code.gs in the "TextExpanderEmail" Apps Script
// project, then: Deploy → Manage deployments → (pencil) → Version: New version
// → Deploy. Editing the existing deployment keeps the same /exec URL, so the
// tracker's NOTIFY_WEBHOOK doesn't need to change.
//
// What it does
//   POST (from the tracker)
//     action=sync   – the tracker sends its current client list on page load.
//                     Stored, no email.
//     (no action)   – a new client was added. Stores the list too, and only
//                     emails Jacob if that client could NOT get a snippet
//                     automatically (one-word name, clash, common word).
//   GET  ?key=FEED_KEY
//     Returns clients added since the feed was switched on as a TextExpander
//     snippet group (first + last initial → full name). Jacob subscribes to
//     this URL once in TextExpander and new clients show up on their own.
//
// Clients already in Jacob's own TextExpander group are never put in the feed:
// the first client list the script receives is saved as the "baseline" and
// left out. Their initials still count as taken, as do any abbreviations
// listed in TAKEN_ABBREVIATIONS, so a new client who clashes with one gets
// an email instead of a duplicate snippet.
//
// The feed URL is the web app's /exec URL plus ?key=<FEED_KEY>. Without the key
// it returns nothing, so the client list isn't readable by anyone who only
// knows the /exec URL (which is visible in the tracker's public source).

const SITE_URL = "https://goodman-campaigns.github.io/Onboarding-Tracker/";
const RECIPIENT = "jacob@goodmancampaigns.com";
const VALID_PARTNERS = ["neil", "jacob"];
const GROUP_NAME = "Clients (auto)";

// Change this to any long random string before deploying, then use it in the
// feed URL you give Jacob. Run showFeedUrl() to print the full URL.
const FEED_KEY = "CHANGE-ME-to-a-long-random-string";

// Put something here (e.g. ";") if the bare initials ever start firing while
// typing normal words. Changing it re-keys every snippet in the feed.
const ABBREV_PREFIX = "";

// Abbreviations Jacob already uses in his own TextExpander group, from his
// export. A new client whose initials are in here is emailed, not fed.
// e.g. ["dm", "jw", "pc"]
const TAKEN_ABBREVIATIONS = [];

// Two-letter combos that are real words; a client whose initials match one of
// these is left out of the feed (it would expand mid-sentence) and Jacob gets
// an email to make that one by hand.
const COMMON_WORDS = new Set(("am an as at be by do go he hi if in is it me my " +
  "no of oh ok on or so to up us we").split(" "));

const TITLES = new Set(["mayor", "sen", "senator", "rep", "representative",
  "dr", "judge", "councilmember", "commissioner", "gov", "governor", "hon"]);

// ── Snippet rules ─────────────────────────────────────────────────────────────
function cleanName(name) {
  return String(name || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function initialsFor(name) {
  const words = cleanName(name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // Colón → Colon
    .split(" ")
    .map(w => w.replace(/[^A-Za-z-]/g, ""))
    .filter(w => w && !TITLES.has(w.toLowerCase()));
  if (words.length < 2) return null;
  return (words[0][0] + words[words.length - 1][0]).toLowerCase();
}

// Returns { snippets: [{abbr, name}], problems: {name: reason} }.
// Baseline clients (already in Jacob's group) get no snippet and no problem,
// but their initials count as taken.
function buildSnippets(names) {
  const baseline = new Set(loadBaseline());
  const taken = new Set(TAKEN_ABBREVIATIONS.map(a => String(a).toLowerCase().replace(ABBREV_PREFIX, "")));
  const byAbbr = {};
  const problems = {};
  names.forEach(n => {
    const ab = initialsFor(n);
    if (baseline.has(n)) { if (ab) (byAbbr[ab] = byAbbr[ab] || []).push(n); return; }
    if (!ab) { problems[n] = "one-word name, so there are no first/last initials"; return; }
    if (COMMON_WORDS.has(ab)) { problems[n] = `"${ab}" is a common word and would expand while typing`; return; }
    (byAbbr[ab] = byAbbr[ab] || []).push(n);
  });
  const snippets = [];
  Object.keys(byAbbr).sort().forEach(ab => {
    const list = byAbbr[ab];
    const fresh = list.filter(n => !baseline.has(n));
    fresh.forEach(n => {
      const others = list.filter(x => x !== n);
      if (others.length) problems[n] = `shares initials "${ab}" with ${others.join(", ")}`;
      else if (taken.has(ab)) problems[n] = `"${ab}" is already one of Jacob's snippets`;
      else snippets.push({ abbr: ABBREV_PREFIX + ab, name: cleanName(n) });
    });
  });
  return { snippets, problems };
}

// ── Storage ───────────────────────────────────────────────────────────────────
function saveClients(json) {
  let list;
  try { list = JSON.parse(json || "[]"); } catch (err) { return null; }
  if (!Array.isArray(list)) return null;
  list = [...new Set(list.map(s => String(s).trim()).filter(Boolean))].sort();
  PropertiesService.getScriptProperties().setProperty("clients", JSON.stringify(list));
  return list;
}

// The first list ever received = clients Jacob already has snippets for.
function saveBaselineIfMissing(list) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("baseline")) props.setProperty("baseline", JSON.stringify(list));
}

function loadBaseline() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty("baseline") || "[]");
}

function loadClients() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty("clients") || "[]");
}

// ── Web app ───────────────────────────────────────────────────────────────────
function doPost(e) {
  const p = (e && e.parameter) || {};
  const list = p.clients ? saveClients(p.clients) : null;
  if (list && p.action === "sync") saveBaselineIfMissing(list);
  if (p.action === "sync") return ContentService.createTextOutput("ok");

  const partnerKey = String(p.partner_key || "").trim().toLowerCase();
  const client = String(p.client_name || "").trim();
  const taskId = String(p.task_id || "text_exp").trim();
  if (!VALID_PARTNERS.includes(partnerKey) || !client) {
    return ContentService.createTextOutput("ignored");
  }

  const problem = buildSnippets(list || loadClients().concat(client)).problems[client];
  if (!problem) return ContentService.createTextOutput("ok – in feed");

  const confirmUrl = SITE_URL + "confirm.html"
    + "?partner=" + encodeURIComponent(partnerKey)
    + "&client=" + encodeURIComponent(client)
    + "&task=" + encodeURIComponent(taskId);

  const safe = escapeHtml(client);
  const html =
    '<p style="font-size:15px">' + safe + ' needs a Text Expander snippet made by hand: ' +
    escapeHtml(problem) + '.</p>' +
    '<p><a href="' + confirmUrl + '" style="display:inline-block;background:#4a9d78;color:#fff;' +
    'text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">Mark complete</a></p>' +
    '<p style="color:#666;font-size:13px">Or open the tracker: <a href="' + SITE_URL + '">' + SITE_URL + '</a></p>';

  MailApp.sendEmail({
    to: RECIPIENT,
    subject: "Make Text Expander for " + client,
    htmlBody: html,
    body: client + " needs a Text Expander snippet made by hand: " + problem +
          "\n\nMark complete: " + confirmUrl + "\n\nOr open the tracker: " + SITE_URL,
  });
  return ContentService.createTextOutput("ok – emailed");
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== FEED_KEY) return ContentService.createTextOutput("");
  const { snippets } = buildSnippets(loadClients());
  return ContentService.createTextOutput(groupXml(snippets)).setMimeType(ContentService.MimeType.XML);
}

// TextExpander group file (.textexpander plist).
function groupXml(snippets) {
  const items = snippets.map(s =>
    "<dict>" +
    "<key>abbreviation</key><string>" + escapeHtml(s.abbr) + "</string>" +
    "<key>abbreviationMode</key><integer>0</integer>" +
    "<key>label</key><string>" + escapeHtml(s.name) + "</string>" +
    "<key>plainText</key><string>" + escapeHtml(s.name) + "</string>" +
    "<key>snippetType</key><integer>0</integer>" +
    "<key>uuidString</key><string>" + stableUuid(s.name) + "</string>" +
    "</dict>").join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>' +
    "<key>groupInfo</key><dict><key>groupName</key><string>" + escapeHtml(GROUP_NAME) + "</string></dict>" +
    "<key>snippetsTE2</key><array>\n" + items + "\n</array>" +
    "</dict></plist>\n";
}

// Same client → same id every time, so a refresh updates snippets in place
// instead of duplicating them.
function stableUuid(s) {
  const hex = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, "te:" + s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("").toUpperCase();
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── Helpers to run from the editor ────────────────────────────────────────────
// Prints the URL to give Jacob, plus what's in the feed and what was left out.
function showFeedUrl() {
  const url = ScriptApp.getService().getUrl();
  Logger.log("Feed URL: " + url + "?key=" + encodeURIComponent(FEED_KEY));
  const { snippets, problems } = buildSnippets(loadClients());
  Logger.log(snippets.length + " snippets:\n" + snippets.map(s => s.abbr + " → " + s.name).join("\n"));
  Logger.log("Left out (make by hand):\n" + Object.keys(problems).map(n => n + ": " + problems[n]).join("\n"));
  Logger.log("Baseline (already in Jacob's group, not in feed): " + loadBaseline().length + " clients");
}

// Only if you need to start over: forgets the baseline so the next tracker
// load re-captures it.
function resetBaseline() {
  PropertiesService.getScriptProperties().deleteProperty("baseline");
}

// Authorizes Gmail and emails YOU a sample of the hand-made-snippet email.
function testSend() {
  const me = Session.getActiveUser().getEmail();
  MailApp.sendEmail(me, "Test: Make Text Expander for Boyko",
    "Boyko needs a Text Expander snippet made by hand: one-word name, so there are no first/last initials.");
}
