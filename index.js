import blessed from "blessed";
import fs from "fs";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";

let currentEnergy = 0;
const tokens = fs.readFileSync("token.txt", "utf8")
 .split("\n")
 .map(line => line.trim())
 .filter(line => line !== "");
let activeToken = tokens.length > 0 ? tokens[0] : "";
let activeProxy = null;

// Helper functions
function getShortAddress(address) {
 if (!address || address.length < 10) return address;
 return address.slice(0, 6) + "..." + address.slice(-4);
}

function getRequestHeaders(token) {
 return {
 'accept': 'application/json',
 'authorization': `Bearer ${token}`,
 'content-type': 'application/json',
 'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Brave";v="134"',
 'sec-ch-ua-mobile': '?0',
 'sec-ch-ua-platform': '"Windows"',
 'sec-fetch-dest': 'empty',
 'sec-fetch-mode': 'cors',
 'sec-fetch-site': 'same-site',
 'sec-gpc': '1',
 'Referer': 'https://fishingfrenzy.co/',
 'Referrer-Policy': 'strict-origin-when-cross-origin',
 'cache-control': 'no-cache',
 'pragma': 'no-cache',
 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
 };
}

function getAgent() {
 if (activeProxy) {
 return new HttpsProxyAgent(activeProxy);
 }
 return null;
}

async function getExternalIP() {
 try {
 const agent = getAgent();
 const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } };
 if (agent) options.agent = agent;
 const response = await fetch("https://api.ipify.org?format=json", options);
 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
 const data = await response.json();
 return data.ip;
 } catch (err) {
 return "Unavailable";
 }
}

// Initialize the screen with a modern dark theme
const screen = blessed.screen({
 smartCSR: true,
 title: "Fishboy - Auto Fishing & Task Bot",
 fullUnicode: true,
 mouse: true,
 style: { bg: "black" }
});

let headerContentHeight = 0;
let autoTaskRunning = false;
let autoFishingRunning = false;
let autoDailyRunning = false;
let autoProcessCancelled = false;
let accountPromptActive = false;

// Colors for the animation
const colors = [
 "{red-fg}",
 "{green-fg}",
 "{blue-fg}",
 "{magenta-fg}",
 "{yellow-fg}",
 "{cyan-fg}"
];

// ASCII art frames for the header animation
const headerFrames = [
  [
    "███╗   ███╗██╗██╗  ██╗ █████╗ ███████╗ █████╗ ",
    "████╗ ████║██║██║ ██╔╝██╔══██╗██╔════╝██╔══██╗",
    "██╔████╔██║██║█████╔╝ ███████║███████╗███████║",
    "██║╚██╔╝██║██║██╔═██╗ ██╔══██║╚════██║██╔══██║",
    "██║ ╚═╝ ██║██║██║  ██╗██║  ██║███████║██║  ██║",
    "╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
  ],
  [
    "▓▓▓╗   ▓▓▓╗▓▓║▓▓║  ▓▓║ ▓▓▓▓▓╗ ▓▓▓▓▓▓█╗ ▓▓▓▓▓╗ ",
    "▓▓▓▓╗ ▓▓▓▓║▓▓║▓▓║ ▓▓╔╝▓▓╔══▓║▓▓╔════╝▓▓╔══▓║  ",
    "▓▓║▓▓▓▓║▓▓║▓▓║▓▓▓▓▓╔╝ ▓▓▓▓▓▓║▓▓▓▓▓█╗ ▓▓▓▓▓▓║  ",
    "▓▓║╚▓▓╔╝▓▓║▓▓║▓▓╔═▓║  ▓▓╔══▓║╚════▓║▓▓╔══▓║   ",
    "▓▓║ ╚═╝ ▓▓║▓▓║▓▓║  ▓▓╗▓▓║  ▓▓║▓▓▓▓▓▓║▓▓║  ▓▓║ ",
    "╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
  ],
  [
    "░░░╗   ░░░╗░░║░░║  ░░║ ░░░░░╗ ░░░░░░█╗ ░░░░░╗ ",
    "░░░░╗ ░░░░║░░║░░║ ░░╔╝░░╔══░║░░╔════╝░░╔══░║  ",
    "░░║░░░░║░░║░░║░░░░░╔╝ ░░░░░░║░░░░░░█╗░░░░░░║  ",
    "░░║╚░░╔╝░░║░░║░░╔═░║  ░░╔══░║╚════░║░░╔══░║   ",
    "░░║ ╚═╝ ░░║░░║░░║  ░░╗░░║  ░░║░░░░░░║░░║  ░░║ ",
    "╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
  ]
];


// Modernized Header Box with Animation
const headerBox = blessed.box({
 top: 0,
 left: "center",
 width: "100%",
 height: 9,
 tags: true,
 padding: { left: 1, right: 1 },
 style: {
 fg: "white",
 bg: "black",
 }
});

// Animation logic for the header
let headerFrameIndex = 0;
let headerColorIndex = 0;

function updateHeaderBanner() {
 const currentFrame = headerFrames[headerFrameIndex];
 const content = currentFrame.map((line, index) => {
 const color = colors[index % colors.length];
 const colorName = color.slice(1, -1);
 return `{center}${color}${line}{/${colorName}}{/center}`;
 }).join("\n");

 const descriptionText = "{center}{bold}{yellow-fg}✦ Auto Fishing & Task Bot ✦{/yellow-fg}{/bold}{/center}";
 headerBox.setContent(`${content}\n${descriptionText}`);
 screen.render();
}

function startHeaderAnimation() {
 setInterval(() => {
 headerFrameIndex = (headerFrameIndex + 1) % headerFrames.length;
 headerColorIndex = (headerColorIndex + 1) % colors.length;
 updateHeaderBanner();
 }, 500);
}

// ASCII art frames for fishing animation
const fishingFrames = [
 // Casting...
 `{center}{cyan-fg} _____ __ _ 
 / ___/__ ____ / /_(_)__ ___ _
/ /__/ _ \`(_-</ __/ / _ \\/ _ \`/
\\___/\\_,_/___/\\__/_/_//_/\\_, / 
 /___/ 
 Casting...{/cyan-fg}{/center}`,
 // Waiting...
 `{center}{cyan-fg} _ __ _ __ _ 
 | | /| / /__ _(_) /_(_)__ ___ _
 | |/ |/ / _ \`/ / __/ / _ \\/ _ \`/
 |__/|__/\\_,_/_/\\__/_/_//_/\\_, / 
 /___/ 
 Waiting...{/cyan-fg}{/center}`,
 // Fish biting!
 `{center}{cyan-fg} _____ __ ___ _ __ _ 
 / __(_)__ / / / _ )(_) /_(_)__ ___ _
 / _// (_-</ _ \\ / _ / / __/ / _ \\/ _ \`
/_/ /_/___/_//_/ /____/_/\\__/_/_//_/\\_, / 
 /___/ 
 Fish biting!{/cyan-fg}{/center}`,
 // Reeling in...
 `{center}{cyan-fg} ___ ___ _ 
 / _ \\___ ___ / (_)__ ___ _ (_)__ 
 / , _/ -_) -_) / / _ \\/ _ \`/ / / _ \\
/_/|_|\\__/\\__/_/_/_//_/\\_, / /_/_//_/
 /___/ 
 Reeling in...{/cyan-fg}{/center}`
];

// Modernized Logs Box with animation area
const logsBox = blessed.box({
 label: "{bold}{cyan-fg}Activity Log{/cyan-fg}{/bold}",
 top: 9,
 left: 0,
 width: "60%",
 height: "91%",
 border: { type: "line" },
 scrollable: true,
 alwaysScroll: true,
 mouse: true,
 keys: true,
 vi: true,
 tags: true,
 padding: { left: 1, right: 1, top: 6, bottom: 1 },
 scrollbar: { ch: " ", style: { bg: "cyan" } },
 style: {
 border: { fg: "cyan" },
 fg: "white",
 bg: "#1a1a1a",
 }
});

// Animation Box (inside Logs Box)
const animationBox = blessed.box({
 parent: logsBox,
 top: 0,
 left: 0,
 width: "100%-2",
 height: 7,
 tags: true,
 style: {
 fg: "cyan",
 bg: "#1a1a1a",
 },
 content: "",
 hidden: true
});

// Modernized User Info Box
const userInfoBox = blessed.box({
 label: "{bold}{green-fg}Profile{/green-fg}{/bold}",
 top: 9,
 left: "60%",
 width: "40%",
 height: 12,
 border: { type: "line" },
 tags: true,
 padding: { left: 1, right: 1 },
 style: {
 border: { fg: "green" },
 fg: "white",
 bg: "#1a1a1a",
 },
 content:
 "Username: loading...\n" +
 "Wallet: loading...\n" +
 "Level: loading...\n" +
 "Gold: loading...\n" +
 "Energy: loading...\n" +
 "EXP: loading...\n" +
 "IP: loading..."
});

// Parent box untuk menu agar dimensi lebih stabil
const menuContainer = blessed.box({
 top: 21,
 left: "60%",
 width: "40%",
 height: "79%",
 style: {
 bg: "#1a1a1a",
 }
});

// Modernized Main Menu
const mainMenu = blessed.list({
 parent: menuContainer,
 label: "{bold}{yellow-fg}Actions{/yellow-fg}{/bold}",
 top: 0,
 left: 0,
 width: "100%",
 height: "100%",
 keys: true,
 mouse: true,
 vi: true,
 border: { type: "line" },
 tags: true,
 padding: { left: 1, right: 1 },
 style: {
 border: { fg: "yellow" },
 bg: "#1a1a1a",
 item: { fg: "white" },
 selected: { bg: "cyan", fg: "black", bold: true },
 hover: { bg: "gray" }
 }
});

// Inventory Menu
const inventoryMenu = blessed.list({
 parent: menuContainer,
 top: 0,
 left: 0,
 width: "100%",
 height: "100%",
 keys: true,
 mouse: true,
 vi: true,
 border: { type: "line" },
 tags: true,
 padding: { left: 1, right: 1 },
 style: {
 border: { fg: "yellow" },
 bg: "#1a1a1a",
 item: { fg: "white" },
 selected: { bg: "cyan", fg: "black", bold: true },
 hover: { bg: "gray" }
 },
 items: [
 "{bold}Chest{/bold}",
 "{bold}Sushi{/bold}",
 "{bold}Back{/bold}",
 ],
 hidden: true,
});

// Prompt untuk input jumlahПоиск Sushi (untuk penggunaan)
const sushiPromptBox = blessed.prompt({
 parent: screen,
 border: "line",
 height: "20%",
 width: "50%",
 top: "center",
 left: "center",
 label: "{bold}{magenta-fg}Sushi Amount{/magenta-fg}{/bold}",
 tags: true,
 keys: true,
 mouse: true,
 style: {
 fg: "white",
 bg: "#1a1a1a",
 border: { fg: "magenta" }
 }
});

// Prompt untuk input jumlah Sushi (untuk pembelian)
const buySushiPromptBox = blessed.prompt({
 parent: screen,
 border: "line",
 height: "20%",
 width: "50%",
 top: "center",
 left: "center",
 label: "{bold}{magenta-fg}Buy Sushi Amount{/magenta-fg}{/bold}",
 tags: true,
 keys: true,
 mouse: true,
 style: {
 fg: "white",
 bg: "#1a1a1a",
 border: { fg: "magenta" }
 }
});

// Prompt untuk input jumlah Fishing
const fishingPromptBox = blessed.prompt({
 parent: screen,
 border: "line",
 height: "20%",
 width: "50%",
 top: "center",
 left: "center",
 label: "{bold}{magenta-fg}Fishing Amount{/magenta-fg}{/bold}",
 tags: true,
 keys: true,
 mouse: true,
 style: {
 fg: "white",
 bg: "#1a1a1a",
 border: { fg: "magenta" }
 }
});

screen.append(headerBox);
screen.append(logsBox);
screen.append(userInfoBox);
screen.append(menuContainer);

function safeRender() {
 setTimeout(() => screen.render(), 50);
}

function addLog(message) {
 const timestamp = new Date().toLocaleTimeString();
 const logMessage = `{white-fg}${timestamp} - ${message}{/white-fg}`;
 logsBox.insertLine(logsBox.getLines().length, logMessage);
 logsBox.setScrollPerc(100);
 safeRender();
}

function clearLogs() {
 logsBox.setContent("");
 logsBox.setScroll(0);
 safeRender();
 addLog("{yellow-fg}Logs cleared.{/yellow-fg}");
}

async function fetchUserProfile(token) {
 try {
 const agent = getAgent();
 const options = { headers: getRequestHeaders(token) };
 if (agent) options.agent = agent;
 const response = await fetch("https://api.fishingfrenzy.co/v1/users/me", options);
 if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
 const data = await response.json();
 return data;
 } catch (err) {
 addLog(`{red-fg}Error fetching user information: ${err.message}{/red-fg}`);
 return null;
 }
}

async function fetchInventory(token, userId) {
 try {
 const response = await fetch(`https://api.fishingfrenzy.co/v1/inventories?userId=${userId}`, {
 method: 'GET',
 headers: getRequestHeaders(token),
 });
 const data = await response.json();
 if (data.status === "success") {
 return data.data;
 } else {
 addLog(`Failed to fetch inventory for Chests and Sushi: ${data.message}`);
 return null;
 }
 } catch (error) {
 addLog(`Error fetching inventory for Chests and Sushi: ${error.message}`);
 return null;
 }
}

async function updateUserInfo() {
 const userProfile = await fetchUserProfile(activeToken);
 if (!userProfile) return;

 currentEnergy = userProfile && userProfile.energy !== undefined ? userProfile.energy : 0;
 let ipLine = "";
 if (activeProxy) {
 const proxyIP = await getExternalIP();
 ipLine = `IP: ${proxyIP}`;
 } else {
 const externalIP = await getExternalIP();
 ipLine = `IP: ${externalIP}`;
 }

 const content = `Username: ${userProfile.username || "Guest Account"}\n` +
 `Wallet: ${getShortAddress(userProfile.walletAddress)}\n` +
 `Level: ${userProfile.level}\n` +
 `Gold: ${userProfile.gold}\n` +
 `Energy: ${userProfile.energy}\n` +
 `EXP: ${userProfile.exp !== undefined ? userProfile.exp : "N/A"}\n` +
 `${ipLine}`;
 userInfoBox.setContent(content);
 safeRender();
 addLog("{yellow-fg}User information updated.{/yellow-fg}");
}

function updateMenuItems() {
 if (autoTaskRunning || autoFishingRunning || autoDailyRunning) {
 mainMenu.setItems([
 "{gray-fg}Auto Complete Task{/gray-fg}",
 "{gray-fg}Auto Fishing{/gray-fg}",
 "{gray-fg}Auto Complete Daily Checkin & Task{/gray-fg}",
 "{gray-fg}Buy Sushi in Shop{/gray-fg}",
 "{gray-fg}Open Inventory{/gray-fg}",
 "{gray-fg}Changed account{/gray-fg}",
 "Clear Logs",
 "Stop Process",
 "Refresh",
 "Exit"
 ]);
 } else {
 mainMenu.setItems([
 "Auto Complete Task",
 "Auto Fishing",
 "Auto Complete Daily Checkin & Task",
 "Buy Sushi in Shop",
 "Open Inventory",
 "Changed account",
 "Clear Logs",
 "Refresh",
 "Exit"
 ]);
 }
 mainMenu.select(0);
 safeRender();
}

// Fishing Animation Logic
let animationInterval = null;
function startFishingAnimation() {
 animationBox.hidden = false;
 let frameIndex = 0;
 animationInterval = setInterval(() => {
 animationBox.setContent(fishingFrames[frameIndex]);
 frameIndex = (frameIndex + 1) % fishingFrames.length;
 safeRender();
 }, 500);
}

function stopFishingAnimation() {
 if (animationInterval) {
 clearInterval(animationInterval);
 animationInterval = null;
 }
 animationBox.hidden = true;
 animationBox.setContent("");
 safeRender();
}

// Open all chests for a user
async function openAllChests(token, userId) {
 const inventory = await fetchInventory(token, userId);
 if (!inventory || !inventory.chests || inventory.chests.length === 0) {
 addLog("No chests available to open.");
 return;
 }

 for (const chest of inventory.chests) {
 try {
 const response = await fetch(`https://api.fishingfrenzy.co/v1/chests/${chest.id}/open`, {
 method: 'GET',
 headers: {
 "accept": "application/json",
 "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh;q=0.5",
 "authorization": `Bearer ${token}`,
 "content-type": "application/json",
 "priority": "u=1, i",
 "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
 "sec-ch-ua-mobile": "?0",
 "sec-ch-ua-platform": "\"Windows\"",
 "sec-fetch-dest": "empty",
 "sec-fetch-mode": "cors",
 "sec-fetch-site": "same-site",
 "Referer": "https://fishingfrenzy.co/",
 "Referrer-Policy": "strict-origin-when-cross-origin"
 },
 });
 const data = await response.json();
 if (response.ok) {
 addLog(`{green-fg}Open Chest Done: Chest ${chest.id}{/green-fg}`);
 } else {
 addLog(`{red-fg}Failed to open chest ${chest.id}: ${data.message || "Unknown error"}{/red-fg}`);
 }
 } catch (error) {
 addLog(`{red-fg}Error opening chest ${chest.id}: ${error.message}{/red-fg}`);
 }
 }
 await updateUserInfo();
}

// Use Sushi
async function useSushi(token, userId, quantity) {
 try {
 const response = await fetch(`https://api.fishingfrenzy.co/v1/items/668d070357fb368ad9e91c8a/use?userId=${userId}&quantity=${quantity}`, {
 method: 'GET',
 headers: {
 "accept": "application/json",
 "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh;q=0.5",
 "authorization": `Bearer ${token}`,
 "content-type": "application/json",
 "priority": "u=1, i",
 "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
 "sec-ch-ua-mobile": "?0",
 "sec-ch-ua-platform": "\"Windows\"",
 "sec-fetch-dest": "empty",
 "sec-fetch-mode": "cors",
 "sec-fetch-site": "same-site",
 "Referer": "https://fishingfrenzy.co/",
 "Referrer-Policy": "strict-origin-when-cross-origin"
 },
 });

 const data = await response.json();
 if (response.ok) {
 addLog(`{green-fg}Use Sushi Done: Used ${quantity} Sushi{/green-fg}`);
 } else {
 addLog(`{red-fg}Failed to use Sushi: ${data.message || "Unknown error"}{/red-fg}`);
 }
 } catch (error) {
 addLog(`{red-fg}Error using Sushi: ${error.message}{/red-fg}`);
 }
 await updateUserInfo();
}

// Buy Sushi
async function buySushi(token, userId, quantity) {
 try {
 const response = await fetch(`https://api.fishingfrenzy.co/v1/items/668d070357fb368ad9e91c8a/buy?userId=${userId}&quantity=${quantity}`, {
 method: 'GET',
 headers: {
 "accept": "application/json",
 "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh;q=0.5",
 "authorization": `Bearer ${token}`,
 "content-type": "application/json",
 "priority": "u=1, i",
 "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
 "sec-ch-ua-mobile": "?0",
 "sec-ch-ua-platform": "\"Windows\"",
 "sec-fetch-dest": "empty",
 "sec-fetch-mode": "cors",
 "sec-fetch-site": "same-site",
 "Referer": "https://fishingfrenzy.co/",
 "Referrer-Policy": "strict-origin-when-cross-origin"
 },
 });

 const data = await response.json();
 if (response.ok) {
 addLog(`{green-fg}Buy Sushi Done: Bought ${quantity} Sushi{/green-fg}`);
 } else {
 addLog(`{red-fg}Failed to buy Sushi: ${data.message || "Unknown error"}{/red-fg}`);
 }
 } catch (error) {
 addLog(`{red-fg}Error buying Sushi: ${error.message}{/red-fg}`);
 }
 await updateUserInfo();
}

// Process Sushi Usage
async function processSushiUsage(quantity) {
 const userProfile = await fetchUserProfile(activeToken);
 if (userProfile) {
 const username = userProfile.username || "Guest Account";
 addLog(`{yellow-fg}Using ${quantity} Sushi for user: ${username}{/yellow-fg}`);
 await useSushi(activeToken, userProfile.id, quantity);
 } else {
 addLog("{red-fg}Failed to fetch user profile for using Sushi.{/red-fg}");
 }
}

// Process Sushi Purchase
async function processSushiPurchase(quantity) {
 const userProfile = await fetchUserProfile(activeToken);
 if (userProfile) {
 const username = userProfile.username || "Guest Account";
 addLog(`{yellow-fg}Buying ${quantity} Sushi for user: ${username}{/yellow-fg}`);
 await buySushi(activeToken, userProfile.id, quantity);
 } else {
 addLog("{red-fg}Failed to fetch user profile for buying Sushi.{/red-fg}");
 }
}

// Functionality
async function autoCompleteTask() {
 try {
 autoTaskRunning = true;
 autoProcessCancelled = false;
 updateMenuItems();
 addLog("{yellow-fg}Starting Auto Complete Task...{/yellow-fg}");
 const agent = getAgent();
 const options = { headers: getRequestHeaders(activeToken) };
 if (agent) options.agent = agent;
 const tasksResponse = await fetch("https://api.fishingfrenzy.co/v1/social-quests/", options);
 if (!tasksResponse.ok)
 throw new Error(`HTTP error fetching tasks! status: ${tasksResponse.status}`);
 const tasks = await tasksResponse.json();
 addLog(`{blue-fg}Fetched ${tasks.length} tasks.{/blue-fg}`);
 for (const task of tasks) {
 if (autoProcessCancelled) {
 addLog("{yellow-fg}Auto Complete Task Cancelled.{/yellow-fg}");
 break;
 }
 if (task.status === "UnClaimed") {
 addLog(`{yellow-fg}Completing task: ${task.description}{/yellow-fg}`);
 const postUrl = `https://api.fishingfrenzy.co/v1/social-quests/${task.id}/verify`;
 const postResponse = await fetch(postUrl, { method: "POST", headers: getRequestHeaders(activeToken) });
 if (!postResponse.ok) {
 addLog(`{red-fg}Error verifying task ${task.description}: HTTP ${postResponse.status}{/red-fg}`);
 continue;
 }
 const result = await postResponse.json();
 if (result && Array.isArray(result.socialQuests)) {
 const updatedTask = result.socialQuests.find((t) => t.id === task.id);
 if (updatedTask) {
 const goldReward = updatedTask.rewards.find((r) => r.type === "Gold");
 if (goldReward) {
 addLog(
 `{green-fg}Task ${task.description} completed{/green-fg}: Status ${updatedTask.status}, Reward Gold: ${goldReward.quantity}`
 );
 } else {
 addLog(
 `{green-fg}Task ${task.description} completed{/green-fg}: Status ${updatedTask.status} (no Gold)`
 );
 }
 } else {
 addLog(`{red-fg}Response verify for task ${task.description} not found.{/red-fg}`);
 }
 } else {
 addLog(`{red-fg}Invalid response for task ${task.description}.{/red-fg}`);
 }
 } else {
 addLog(`{green-fg}Task ${task.description} already claimed.{/green-fg}`);
 }
 }
 addLog("{green-fg}All tasks processed.{/green-fg}");
 } catch (error) {
 addLog(`{red-fg}Error in autoCompleteTask: ${error.message}{/red-fg}`);
 } finally {
 autoTaskRunning = false;
 updateMenuItems();
 updateUserInfo();
 }
}

async function autoCompleteDailyCheckinAndTask() {
 autoProcessCancelled = false;
 autoDailyRunning = true;
 updateMenuItems();
 addLog("{yellow-fg}Starting Auto Complete Daily Checkin & Task...{/yellow-fg}");

 try {
 const checkinResponse = await fetch("https://api.fishingfrenzy.co/v1/daily-rewards/claim", {
 method: "GET",
 headers: getRequestHeaders(activeToken),
 agent: getAgent()
 });
 if (checkinResponse.status === 200) {
 addLog("{green-fg}Daily Checkin successful!!{/green-fg}");
 } else if (checkinResponse.status === 400) {
 const json = await checkinResponse.json();
 addLog(`{yellow-fg}Daily Checkin: ${json.message}{/yellow-fg}`);
 } else {
 addLog(`{red-fg}Daily Checkin: Unexpected status: ${checkinResponse.status}{/red-fg}`);
 }
 } catch (error) {
 addLog(`{red-fg}Error during Daily Checkin: ${error.message}{/red-fg}`);
 }

 if (autoProcessCancelled) {
 addLog("{yellow-fg}Daily Checkin & Task Cancelled{/yellow-fg}");
 autoDailyRunning = false;
 updateMenuItems();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }

 try {
 const questsResponse = await fetch("https://api.fishingfrenzy.co/v1/user-quests", {
 method: "GET",
 headers: getRequestHeaders(activeToken),
 agent: getAgent()
 });
 if (!questsResponse.ok) {
 addLog(`{red-fg}Error fetching quests: HTTP ${questsResponse.status}{/red-fg}`);
 } else {
 const quests = await questsResponse.json();
 for (const quest of quests) {
 const reward = quest.rewards && quest.rewards[0] ? quest.rewards[0] : {};
 let statusLabel = "";
 if (quest.isCompleted && quest.isClaimed) {
 statusLabel = "{green-fg}[CLAIMED]{/green-fg}";
 } else if (quest.isCompleted && !quest.isClaimed) {
 statusLabel = "{red-fg}[COMPLETED, NOT CLAIMED]{/red-fg}";
 } else {
 statusLabel = "{yellow-fg}[IN PROGRESS]{/yellow-fg}";
 }
 addLog(`{yellow-fg}Quest: ${quest.name} - ${quest.description} | Reward: ${reward.name || "N/A"} (${reward.quantity || 0}) ${statusLabel}{/yellow-fg}`);
 if (quest.isCompleted && !quest.isClaimed) {
 try {
 const claimResponse = await fetch(`https://api.fishingfrenzy.co/v1/user-quests/${quest.id}/claim`, {
 method: "POST",
 headers: getRequestHeaders(activeToken),
 agent: getAgent()
 });
 if (claimResponse.ok) {
 const claimData = await claimResponse.json();
 const resultMessage = claimData.message || claimData.result || "Claim successful";
 addLog(`{green-fg}Claimed quest ${quest.name}: ${resultMessage}{/green-fg}`);
 } else {
 const claimData = await claimResponse.json();
 addLog(`{red-fg}Failed to claim quest ${quest.name}: ${claimData.message || "Failed"}{/red-fg}`);
 }
 } catch (claimError) {
 addLog(`{red-fg}Error claiming quest ${quest.name}: ${claimError.message}{/red-fg}`);
 }
 }
 if (autoProcessCancelled) break;
 }
 }
 } catch (error) {
 addLog(`{red-fg}Error fetching daily quests: ${error.message}{/red-fg}`);
 }

 addLog("{green-fg}Auto Complete Daily Checkin & Task finished.{/green-fg}");
 autoDailyRunning = false;
 updateMenuItems();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
}

async function fish(range) {
 return new Promise((resolve, reject) => {
 const token = activeToken;
 const agent = getAgent();
 const wsOptions = agent ? { agent } : {};
 const ws = new WebSocket(`wss://api.fishingfrenzy.co/?token=${token}`, wsOptions);
 let gameStarted = false;
 let gameSuccess = false;
 const keyFrames = [];
 const requiredFrames = 10;
 const interpolationSteps = 30;
 let endSent = false;
 const timeout = setTimeout(() => {
 addLog("{yellow-fg}Fishing timeout - closing connection{/yellow-fg}");
 if (ws.readyState === WebSocket.OPEN) ws.close();
 resolve(false);
 }, 30000);
 ws.on('open', () => {
 ws.send(JSON.stringify({
 cmd: 'prepare',
 range: range.toLowerCase().replace(' ', '_'),
 is5x: false
 }));
 });
 ws.on('message', (data) => {
 try {
 const message = JSON.parse(data.toString());
 if (message.type === 'initGame') {
 gameStarted = true;
 ws.send(JSON.stringify({ cmd: 'start' }));
 }
 if (message.type === 'gameState') {
 const frame = message.frame || 0;
 const direction = message.dir || 0;
 const x = 450 + frame * 2 + direction * 5;
 const y = 426 + frame * 2 - direction * 3;
 const entry = direction !== 0 ? [x, y, frame, direction] : [x, y];
 keyFrames.push(entry);
 if (keyFrames.length === requiredFrames && !endSent) {
 let finalFrames = [];
 if (keyFrames.length < 2) {
 finalFrames = keyFrames.slice();
 } else {
 finalFrames.push(keyFrames[0]);
 for (let i = 1; i < keyFrames.length; i++) {
 const prev = keyFrames[i - 1].slice(0, 2);
 const curr = keyFrames[i].slice(0, 2);
 const interpolated = [];
 for (let j = 1; j < interpolationSteps; j++) {
 const t = j / interpolationSteps;
 interpolated.push([
 Math.round(prev[0] + (curr[0] - prev[0]) * t),
 Math.round(prev[1] + (curr[1] - prev[1]) * t)
 ]);
 }
 finalFrames.push(...interpolated);
 finalFrames.push(keyFrames[i]);
 }
 }
 const endCommand = {
 cmd: 'end',
 rep: { fs: 100, ns: 200, fps: 20, frs: finalFrames },
 en: 1
 };
 ws.send(JSON.stringify(endCommand));
 endSent = true;
 }
 }
 if (message.type === 'gameOver') {
 gameSuccess = message.success;
 clearTimeout(timeout);
 ws.close();
 if (gameSuccess) {
 const fishInfo = message.catchedFish.fishInfo;
 addLog(`{green-fg}Caught Fish{/green-fg} {bold}${fishInfo.fishName}{/bold} (Quality: ${fishInfo.quality}) worth {bold}${fishInfo.sellPrice}{/bold} coins and {bold}${fishInfo.expGain} XP{/bold}!`);
 } else {
 addLog("{red-fg}Failed to catch fish{/red-fg}");
 }
 resolve(gameSuccess);
 }
 } catch (err) {
 addLog(`{red-fg}Error parsing WS message: ${err.message}{/red-fg}`);
 }
 });
 ws.on('error', (error) => {
 clearTimeout(timeout);
 addLog(`{red-fg}WebSocket error: ${error.message}{/red-fg}`);
 resolve(false);
 });
 ws.on('close', () => {
 clearTimeout(timeout);
 if (!gameStarted) resolve(false);
 });
 });
}

function showCountdown(seconds) {
 return new Promise((resolve) => {
 const countdownBox = blessed.box({
 parent: screen,
 top: '80%',
 left: 'center',
 width: 'shrink',
 height: 3,
 border: { type: 'line' },
 tags: true,
 style: {
 border: { fg: 'cyan' },
 bg: '#1a1a1a',
 fg: 'yellow'
 }
 });
 let remaining = seconds;
 countdownBox.setContent(`{yellow-fg}Countdown: ${remaining} seconds{/yellow-fg}`);
 screen.render();
 const interval = setInterval(() => {
 remaining--;
 if (remaining >= 0) {
 countdownBox.setContent(`{yellow-fg}Countdown: ${remaining} seconds{/yellow-fg}`);
 screen.render();
 }
 if (remaining < 0) {
 clearInterval(interval);
 countdownBox.destroy();
 screen.render();
 resolve();
 }
 }, 1000);
 });
}

async function processFishing(range, energyCost, times) {
 addLog(`{yellow-fg}Auto Fishing started:{/yellow-fg} {bold}{cyan-fg}${range}{/cyan-fg}{/bold} for {bold}{cyan-fg}${times}{/cyan-fg}{/bold} times`);
 for (let i = 1; i <= times; i++) {
 if (autoProcessCancelled) {
 addLog("{yellow-fg}Auto Fishing Cancelled.{/yellow-fg}");
 stopFishingAnimation();
 break;
 }
 addLog(`{yellow-fg}Fishing at range{/yellow-fg} {bold}{cyan-fg}${range}{/cyan-fg}{/bold} ({bold}{cyan-fg}${energyCost} Energy{/cyan-fg}{/bold})`);

 startFishingAnimation();

 let success = false;
 try {
 success = await fish(range);
 } catch (err) {
 addLog(`{red-fg}Error while fishing: ${err.message}{/red-fg}`);
 stopFishingAnimation();
 }

 stopFishingAnimation();

 if (success) {
 addLog("{green-fg}Fishing successful.{/green-fg}");
 } else {
 addLog("{red-fg}Fishing failed.{/red-fg}");
 }
 await updateUserInfo();
 addLog(`{green-fg}Fishing completed ${i}/${times}{/green-fg}`);
 if (i < times && !autoProcessCancelled) {
 await showCountdown(5);
 }
 }
 addLog(`{green-fg}Auto Fishing finished: ${range}{/green-fg}`);
 autoFishingRunning = false;
 updateMenuItems();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
}

function showFishingPopup() {
 const fishingContainer = blessed.box({
 parent: screen,
 top: 'center',
 left: 'center',
 width: '50%',
 height: '50%',
 border: { type: "line" },
 label: "{bold}{magenta-fg}Select Fishing Range{/magenta-fg}{/bold}",
 tags: true,
 style: {
 border: { fg: 'magenta' },
 bg: '#1a1a1a'
 }
 });
 const fishingList = blessed.list({
 parent: fishingContainer,
 top: 1,
 left: 1,
 width: '95%',
 height: '70%',
 keys: true,
 mouse: true,
 vi: true,
 items: [
 'Short Range (1 Energy)',
 'Mid Range (2 Energy)',
 'Long Range (3 Energy)'
 ],
 tags: true,
 style: {
 selected: { bg: 'cyan', fg: 'black', bold: true },
 hover: { bg: 'gray' }
 }
 });
 const cancelButton = blessed.button({
 parent: fishingContainer,
 bottom: 1,
 left: 'center',
 width: 10,
 height: 1,
 content: ' Cancel ',
 align: 'center',
 mouse: true,
 keys: true,
 shrink: true,
 style: {
 bg: 'red',
 hover: { bg: 'darkred' }
 }
 });
 fishingList.focus();
 screen.render();
 fishingList.on('select', (item, index) => {
 fishingContainer.destroy();
 screen.render();
 let range, energyCost;
 if (index === 0) { range = 'Short Range'; energyCost = 1; }
 else if (index === 1) { range = 'Mid Range'; energyCost = 2; }
 else if (index === 2) { range = 'Long Range'; energyCost = 3; }
 addLog(`{yellow-fg}Range selected:{/yellow-fg} {bold}{cyan-fg}${range}{/cyan-fg}{/bold} (Cost: {bold}{cyan-fg}${energyCost}{/cyan-fg}{/bold} Energy)`);
 fishingPromptBox.setFront();
 screen.render();
 fishingPromptBox.readInput("Enter number of fishing attempts:", "", async (err, value) => {
 if (err || !value) {
 addLog("{yellow-fg}Input cancelled.{/yellow-fg}");
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }
 const times = parseInt(value);
 if (isNaN(times) || times <= 0) {
 addLog("{red-fg}Invalid input. Auto Fishing cancelled.{/red-fg}");
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }
 const totalCost = energyCost * times;
 if (totalCost > currentEnergy) {
 addLog(`{yellow-fg}Not enough energy!{/yellow-fg} Available: {red-fg}${currentEnergy}{/red-fg}, Required: {green-fg}${totalCost}{/green-fg}`);
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }
 autoProcessCancelled = false;
 autoFishingRunning = true;
 updateMenuItems();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 await processFishing(range, energyCost, times);
 });
 });
 cancelButton.on('press', () => {
 fishingContainer.destroy();
 addLog("{yellow-fg}Auto Fishing cancelled.{/yellow-fg}");
 autoProcessCancelled = false;
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 });
 fishingContainer.key(['escape'], () => {
 fishingContainer.destroy();
 addLog("{yellow-fg}Auto Fishing cancelled.{/yellow-fg}");
 autoProcessCancelled = false;
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 });
}

async function changedAccount() {
 if (accountPromptActive) return;
 accountPromptActive = true;

 const allTokens = fs.readFileSync("token.txt", "utf8")
 .split("\n")
 .map(line => line.trim())
 .filter(line => line !== "");
 if (allTokens.length === 0) {
 addLog("{red-fg}No accounts found in token.txt{/red-fg}");
 accountPromptActive = false;
 return;
 }
 const reqHeaders = getRequestHeaders(activeToken);
 const accountPromises = allTokens.map(token =>
 fetch("https://api.fishingfrenzy.co/v1/users/me", { headers: { ...reqHeaders, 'authorization': `Bearer ${token}` } })
 .then(res => res.ok ? res.json() : null)
 .catch(() => null)
 );
 const accounts = await Promise.all(accountPromises);
 const accountItems = accounts.map((acc, index) => {
 if (acc) {
 let label = `${acc.username || "Guest Account"} - ${getShortAddress(acc.walletAddress)}`;
 if (allTokens[index] === activeToken) label += " [Active]";
 return { token: allTokens[index], label };
 }
 return { token: allTokens[index], label: `Invalid Account ${index + 1}` };
 });
 const accountList = blessed.list({
 parent: screen,
 top: "center",
 left: "center",
 width: "50%",
 height: "60%",
 border: { type: "line" },
 label: "{bold}{green-fg}Select Account{/green-fg}{/bold}",
 keys: true,
 mouse: true,
 vi: true,
 items: accountItems.map(item => item.label),
 tags: true,
 style: {
 bg: '#1a1a1a',
 selected: { bg: "cyan", fg: "black", bold: true },
 hover: { bg: "gray" }
 }
 });
 screen.append(accountList);
 accountList.focus();
 screen.render();
 accountList.on("select", (item, index) => {
 screen.remove(accountList);
 screen.render();
 if (accountItems[index] && accountItems[index].label.indexOf("Invalid") === -1) {
 const newToken = accountItems[index].token;
 showProxyPrompt(newToken, accountItems[index].label);
 } else {
 addLog("{red-fg}Invalid account selected.{/red-fg}");
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 accountPromptActive = false;
 }
 });

 accountList.key("escape", () => {
 screen.remove(accountList);
 screen.render();
 accountPromptActive = false;
 });
}

function showProxyPrompt(newToken, accountLabel) {
 const proxyPrompt = blessed.list({
 parent: screen,
 top: "center",
 left: "center",
 width: "50%",
 height: "40%",
 border: { type: "line" },
 label: "{bold}{yellow-fg}Use Proxy?{/yellow-fg}{/bold}",
 keys: true,
 mouse: true,
 vi: true,
 items: ["No", "Yes"],
 tags: true,
 style: {
 bg: '#1a1a1a',
 selected: { bg: "cyan", fg: "black", bold: true },
 hover: { bg: "gray" }
 }
 });
 screen.append(proxyPrompt);
 proxyPrompt.focus();
 screen.render();
 proxyPrompt.on("select", async (pItem, pIndex) => {
 proxyPrompt.destroy();
 screen.render();
 if (pIndex === 1) {
 let proxies = [];
 try {
 proxies = fs.readFileSync("proxy.txt", "utf8")
 .split("\n")
 .map(line => line.trim())
 .filter(line => line !== "");
 } catch (err) {
 addLog("{red-fg}Error reading proxy.txt{/red-fg}");
 }
 if (proxies.length === 0) {
 addLog("{yellow-fg}No proxies found in proxy.txt, proceeding without proxy.{/yellow-fg}");
 activeProxy = null;
 activeToken = newToken;
 updateUserInfo();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 accountPromptActive = false;
 } else {
 showProxySelection(proxies, newToken, accountLabel);
 }
 } else {
 activeProxy = null;
 activeToken = newToken;
 addLog(`{green-fg}Changed account to: ${accountLabel}{/green-fg}`);
 updateUserInfo();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 accountPromptActive = false;
 }
 });
}

function showProxySelection(proxies, newToken, accountLabel) {
 const proxyContainer = blessed.box({
 parent: screen,
 top: "center",
 left: "center",
 width: "50%",
 height: "50%",
 border: { type: "line" },
 label: "{bold}{cyan-fg}Select Proxy{/cyan-fg}{/bold}",
 tags: true,
 style: {
 border: { fg: 'cyan' },
 bg: '#1a1a1a'
 }
 });
 const proxyList = blessed.list({
 parent: proxyContainer,
 top: 1,
 left: 1,
 width: '95%',
 height: '70%',
 keys: true,
 mouse: true,
 vi: true,
 items: proxies.map(p => p === activeProxy ? `${p} [Active]` : p),
 tags: true,
 style: {
 selected: { bg: 'cyan', fg: 'black', bold: true },
 hover: { bg: 'gray' }
 }
 });
 const cancelButton = blessed.button({
 parent: proxyContainer,
 bottom: 1,
 left: 'center',
 width: 10,
 height: 1,
 content: ' Cancel ',
 align: 'center',
 mouse: true,
 keys: true,
 shrink: true,
 style: {
 bg: 'red',
 hover: { bg: 'darkred' }
 }
 });
 proxyList.focus();
 screen.render();
 proxyList.on("select", (pItem, pIndex) => {
 proxyContainer.destroy();
 screen.render();
 activeProxy = proxies[pIndex];
 activeToken = newToken;
 addLog(`{green-fg}Changed account to: ${accountLabel} with proxy: ${activeProxy}{/green-fg}`);
 updateUserInfo();
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 accountPromptActive = false;
 });
 cancelButton.on("press", () => {
 proxyContainer.destroy();
 screen.render();
 showProxyPrompt(newToken, accountLabel);
 });
}

async function autoFishing() {
 showFishingPopup();
}

async function buySushiInShop() {
 addLog("{yellow-fg}Buy Sushi in Shop selected.{/yellow-fg}");
 buySushiPromptBox.setFront();
 screen.render();
 buySushiPromptBox.readInput("Enter number of Sushi to buy:", "", async (err, value) => {
 if (err || !value) {
 addLog("{yellow-fg}Input cancelled.{/yellow-fg}");
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }
 const quantity = parseInt(value);
 if (isNaN(quantity) || quantity <= 0) {
 addLog("{red-fg}Invalid input. Sushi purchase cancelled.{/red-fg}");
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 return;
 }
 addLog(`{yellow-fg}Buying Sushi:{/yellow-fg} {bold}{cyan-fg}${quantity}{/cyan-fg}{/bold} Sushi`);
 await processSushiPurchase(quantity);
 mainMenu.select(0);
 mainMenu.focus();
 screen.render();
 });
}

mainMenu.on("select", async (item) => {
 const text = item.getText();

 if ((autoTaskRunning || autoFishingRunning || autoDailyRunning) && text !== "Stop Process") {
 addLog("{yellow-fg}A process is running. Wait or select 'Stop Process'.{/yellow-fg}");
 return;
 }

 if (text === "Stop Process") {
 autoProcessCancelled = true;
 addLog("{red-fg}Stop Process received. Stopping...{/red-fg}");
 stopFishingAnimation();
 return;
 }

 switch (text) {
 case "Auto Complete Task":
 autoCompleteTask();
 break;
 case "Auto Fishing":
 autoFishing();
 break;
 case "Auto Complete Daily Checkin & Task":
 autoCompleteDailyCheckinAndTask();
 break;
 case "Buy Sushi in Shop":
 buySushiInShop();
 break;
 case "Open Inventory":
 mainMenu.hidden = true;
 inventoryMenu.hidden = false;
 inventoryMenu.focus();
 screen.render();
 break;
 case "Changed account":
 changedAccount();
 break;
 case "Clear Logs":
 clearLogs();
 break;
 case "Refresh":
 updateUserInfo();
 break;
 case "Exit":
 process.exit(0);
 break;
 default:
 addLog("{red-fg}Unknown menu item.{/red-fg}");
 }
});

inventoryMenu.on('select', async (item, index) => {
 if (index === 0) { // Chest
 const userProfile = await fetchUserProfile(activeToken);
 if (userProfile) {
 addLog(`Opening all chests for user: ${userProfile.username || "Guest Account"}`);
 await openAllChests(activeToken, userProfile.id);
 } else {
 addLog("Failed to fetch user profile for opening chests.");
 }
 inventoryMenu.hidden = true;
 mainMenu.hidden = false;
 mainMenu.focus();
 screen.render();
 } else if (index === 1) { // Sushi
 addLog("{yellow-fg}Sushi selected.{/yellow-fg}");
 sushiPromptBox.setFront();
 screen.render();
 sushiPromptBox.readInput("Enter number of Sushi to use:", "", async (err, value) => {
 if (err || !value) {
 addLog("{yellow-fg}Input cancelled.{/yellow-fg}");
 inventoryMenu.hidden = true;
 mainMenu.hidden = false;
 mainMenu.focus();
 screen.render();
 return;
 }
 const quantity = parseInt(value);
 if (isNaN(quantity) || quantity <= 0) {
 addLog("{red-fg}Invalid input. Sushi usage cancelled.{/red-fg}");
 inventoryMenu.hidden = true;
 mainMenu.hidden = false;
 mainMenu.focus();
 screen.render();
 return;
 }
 addLog(`{yellow-fg}Using Sushi:{/yellow-fg} {bold}{cyan-fg}${quantity}{/cyan-fg}{/bold} Sushi`);
 await processSushiUsage(quantity);
 inventoryMenu.hidden = true;
 mainMenu.hidden = false;
 mainMenu.focus();
 screen.render();
 });
 } else if (index === 2) { // Back
 inventoryMenu.hidden = true;
 mainMenu.hidden = false;
 mainMenu.focus();
 screen.render();
 }
});

screen.key(["escape", "q", "C-c"], () => process.exit(0));

function adjustLayout() {
 const { width, height } = screen;
 headerBox.width = "100%";
 headerBox.height = 9;
 logsBox.top = headerBox.height;
 logsBox.left = 0;
 logsBox.width = Math.floor(width * 0.6);
 logsBox.height = height - headerBox.height;
 const rightHeight = height - headerBox.height;
 const userInfoHeight = Math.max(Math.floor(rightHeight * 0.35), 10);
 userInfoBox.top = headerBox.height;
 userInfoBox.left = Math.floor(width * 0.6);
 userInfoBox.width = Math.floor(width * 0.4);
 userInfoBox.height = userInfoHeight;
 menuContainer.top = headerBox.height + userInfoHeight;
 menuContainer.left = Math.floor(width * 0.6);
 menuContainer.width = Math.floor(width * 0.4);
 menuContainer.height = height - headerBox.height - userInfoHeight;
 safeRender();
}

// Inisialisasi aplikasi dengan penundaan untuk memastikan semua elemen siap
setTimeout(() => {
 updateMenuItems();
 mainMenu.focus();
 updateHeaderBanner();
 startHeaderAnimation();
 adjustLayout();
 safeRender();
 screen.render();
 changedAccount();
}, 100); // Penundaan 100ms untuk memastikan semua elemen UI siap
