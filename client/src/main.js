/**
 * Entry point – loads styles and starts the app.
 */

import "./style.css";
import "./participant-overlay.css";
import { bootstrap } from "./app/bootstrap.js";

const app = document.querySelector("#app");
bootstrap(app);
