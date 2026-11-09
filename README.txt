DADU MUSLIM STUDENTS JAM'AA SECTOR - Backend + Database

WHAT YOU NEED
- Node.js version 22.13 or newer (download from nodejs.org, choose LTS)

HOW TO RUN (on a computer)
1. Unzip the folder.
2. Open a terminal / Command Prompt inside the folder.
3. Run:  npm start
4. Open in your browser:  http://localhost:3000
   The database file "jamaa.db" is created automatically the first time.

DEFAULT PINs (change them after first login with the "Change PIN" button)
Leadership 1000 | Vice Leadership 1001 | Financial 2001 | Ziyara 2002
Social Affairs 2003 | Caffee 2004 | Academy 2005 | Da'awa 2006

OTHER PEOPLE ON THE SAME WIFI
Find the computer's IP address (example 192.168.1.20) and open
http://192.168.1.20:3000 on their phones.

PUT ONLINE
GitHub Pages cannot run a backend. Use a host that runs Node.js and keeps
files on disk (a VPS, Railway or Render with a persistent disk).
Back up the file jamaa.db regularly - it holds all members.

FOLDER
server.js        backend: API, login, SQLite database
index.html, style.css, script.js   the pages people see

ONLINE ON RENDER (keeps the database)
1. Upload this whole folder to a GitHub repository (all files together, no folders).
2. On render.com: New + > Blueprint > choose the repository > Apply.
   render.yaml adds a 1 GB disk so jamaa.db survives restarts and updates.
3. When it finishes, open the link Render gives you (https://....onrender.com).
4. Login as Leadership (PIN 1000) and change every PIN first.
Free plans have NO disk: members would be lost on restart. Use a paid plan.
