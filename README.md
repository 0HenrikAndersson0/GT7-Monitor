# Gran Turismo 7 Telemetry Dashboard & Race Engineer

A real-time telemetry dashboard for Gran Turismo 7 that features an automated, fully-voiced Race Engineer. The app tracks your lap times, fuel usage, dynamic 5-sector micro-splits, and displays everything on a sleek, mobile-friendly interface. 

With the optional Discord integration, the Race Engineer will even speak to you directly in your PlayStation headphones alongside your game audio—reading out lap times, sector gaps, and checking on you if you crash!

---

## 🚀 How to Install and Run

Don't worry if you aren't a programmer! Just follow these simple steps to get the app running on your computer.

### Step 1: Install Node.js
Your computer needs a program called Node.js to run this application.
1. Go to [nodejs.org](https://nodejs.org/).
2. Download and install the recommended version for your operating system (Windows, Mac, or Linux).

### Step 2: Download this App
1. Download this repository to your computer (Click the green "Code" button at the top right of this page and select "Download ZIP").
2. Extract the ZIP file to a folder on your computer.

### Step 3: Start the App
1. Open your computer's **Terminal** (Mac) or **Command Prompt** (Windows).
2. Navigate to the folder where you extracted the app. (Tip: You can type `cd ` and then drag and drop the folder into the terminal window, then press Enter).
3. Type the following command and press Enter to install the required files:
   ```bash
   npm install
   ```
4. Once that finishes, type this command and press Enter to launch the app:
   ```bash
   npm start
   ```

The app will open automatically! It will scan your local Wi-Fi network to find your PlayStation. Just make sure your computer and your PlayStation are connected to the same Wi-Fi network/router.

*(Want to view the dashboard on your iPad or phone while driving? Just open the web address shown at the bottom of the desktop app in your mobile browser!)*

---

## 🎧 Setting up the Discord Voice Engineer (Optional)

If you want the Race Engineer to speak to you directly inside your PlayStation headset, you can use the built-in Discord integration. The app will spawn a bot that joins your Discord voice call!

### 1. Create a Discord Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and sign in.
2. Click **New Application** at the top right. Name it something like "GT7 Race Engineer".
3. In the left menu, click **Bot**. 
4. Under the "Token" section, click **Reset Token**. Copy this long string of letters and numbers—this is your **Bot Token**! Keep it secret.

### 2. Invite the Bot to your Server
1. Still in the Developer Portal, click **OAuth2** -> **URL Generator** on the left menu.
2. Under "Scopes", check the box for **bot**.
3. Scroll to the bottom, copy the Generated URL, and paste it into your web browser. 
4. Select your private Discord server to invite the bot.

### 3. Get your Channel ID
1. Open the Discord app on your computer. 
2. Make sure you have Developer Mode turned on (Go to Discord Settings > Advanced > Developer Mode).
3. Right-click on the Voice Channel you want the bot to join and click **Copy Channel ID**.

### 4. Connect the App
1. Open the GT7 Telemetry Desktop App.
2. Click the **Settings ⚙️** icon in the bottom right corner.
3. Paste your **Bot Token** and **Voice Channel ID** into the boxes.
4. Click **Save & Restart Bot**. You will instantly hear a chime as the bot joins your Discord channel!

### 5. Listen on your PlayStation!
1. Link your Discord account to your PlayStation (PS5 Settings > Users and Accounts > Linked Services > Discord).
2. Join the same Discord Voice Channel using your PlayStation. 
3. Start driving in GT7! The engineer will automatically map your first lap and start speaking to you!

---

## ✨ Features
* **Zero-Config Telemetry**: No IP addresses to type. The app automatically scans your network and handshakes with your PlayStation.
* **Automated Track Mapping**: During your first out-lap, the app silently learns the track's geometry and automatically slices it into 5 dynamic timing sectors.
* **Crash Detection**: Uses raw physics and G-Force telemetry to detect rollovers, airborne jumps, and massive impacts, while intelligently ignoring the AI pit lane takeover.
* **Mobile Web View**: Pop your iPad or phone on your racing rig. The app hosts a local web server so you can view the dashboard smoothly on any device.
