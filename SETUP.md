# Work Tracker — Setup Guide

## 1. First-time Run
```
npm install
npm start
```

## 2. Google Sheets Setup (one-time)

### A. Create a Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create a new project (e.g. "WorkTracker")
3. Enable **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"

### B. Create a Service Account
1. APIs & Services → Credentials → Create Credentials → Service Account
2. Name it anything (e.g. "worktracker-bot"), click Done
3. Click the service account → **Keys** tab → Add Key → JSON
4. Download the JSON file — keep it safe, this is your credentials file

### C. Create the Spreadsheet
1. Go to Google Sheets and create a new blank spreadsheet
2. Copy the Spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
3. Share the spreadsheet with the service account email
   (found in the JSON file as `client_email`) — give it **Editor** access

### D. Configure the App
1. Open Work Tracker → go to **Settings** tab
2. Click **Browse…** and select the credentials JSON file
3. Paste the Spreadsheet ID
4. Click **Test Connection** to verify
5. Click **Save Settings**

The app will auto-create "WorkLog" and "Archived" sheets on first connect.

## 3. Build as .exe
```
npm run build
```
Output will be in the `dist/` folder:
- `Work Tracker Setup.exe` — installer
- `Work Tracker.exe` — portable version

## 4. Move to Another PC
- Copy your credentials JSON file to the new PC
- Install the app (or use the portable exe)
- Go to Settings, point to the JSON file, enter the same Spreadsheet ID
- All your data is already in Google Sheets!
