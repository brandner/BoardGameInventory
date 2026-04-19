# Board Game Inventory 🚀

A Cloudflare Pages full-stack application built with React, Vite, TailwindCSS, Hono, D1, R2, and Gemini 2.5 Flash Vision.

## 🛠️ Deploying to Production

To take this application off your localhost and deploy it live to the global Cloudflare edge, follow these 5 steps in your terminal.

### 1. Provision Cloudflare Resources
First, you need to create the production Database and Bucket within your Cloudflare account. 

Run these commands to provision them:
```bash
npx wrangler d1 create bgi-db
npx wrangler r2 bucket create bgi-photos
```

*Note: After running the D1 command, Wrangler will print out a `database_name` and a `database_id`. Open your `wrangler.toml` file and replace the `database_id = "PLACEHOLDER"` with the actual ID it gave you!*

### 2. Push the Database Schema
Now that your production database is created, you must instantiate the tables (Shelves & Games) onto the live server.
```bash
npx wrangler d1 execute bgi-db --remote --file=./schema.sql
```

### 3. Create the Pages Project
Before injecting secrets or deploying, initialize the Pages project on Cloudflare:
```bash
npx wrangler pages project create boardgameinventory --production-branch main
```

### 4. Set Production Secrets
Your `.dev.vars` file is strictly for your local server and will *never* be uploaded to Cloudflare for security reasons. You must inject your secrets into your live Cloudflare project directly using these commands:
```bash
npx wrangler pages secret put APP_PIN
npx wrangler pages secret put GEMINI_API_KEY
```
*(It will prompt you to type the actual keys in the terminal. Once you press Enter, they are securely locked into the Cloudflare environment.)*

### 5. Build the Frontend
Compile your React application into raw lightning-fast Static Assets (`/dist`).
```bash
npm run build
```

### 6. Deploy 🔥
Push the final compiled frontend and your Hono backend up to Cloudflare Pages!
```bash
npx wrangler pages deploy dist
```
*(This command will print out the live URL of your newly launched web app!)*
