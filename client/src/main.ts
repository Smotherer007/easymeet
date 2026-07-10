/**
 * Entry point – loads styles and starts the app.
 */

/* Self-hosted (CSP: keine fonts.googleapis.com) */
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./style.css";
import "./participant-overlay.css";
import { bootstrap } from "./app/index.js";

const app = document.querySelector("#app");
bootstrap(app);
