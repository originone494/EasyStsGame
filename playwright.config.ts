import { defineConfig } from '@playwright/test';
declare const process: { env: Record<string,string|undefined> };
export default defineConfig({testDir:'tests/browser',use:{baseURL:'http://127.0.0.1:5173',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH}},webServer:{command:'npm run dev -- --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:false}});
