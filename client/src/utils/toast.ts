/**
 * Short toasts for background events (join, file, …).
 */

const ROOT_ID = "toast-root";

function ensureRoot() {
	let root = document.getElementById(ROOT_ID);
	if (!root) {
		root = document.createElement("div");
		root.id = ROOT_ID;
		root.className = "toast-root";
		root.setAttribute("aria-live", "polite");
		document.body.appendChild(root);
	}
	return root;
}

/**
 * @param {string} message
 * @param {{ type?: 'info' | 'success' | 'warning'; duration?: number }} [opts]
 */
export function showToast(message, opts = {}) {
	const { type = "info", duration = 4200 } = opts;
	const root = ensureRoot();
	const el = document.createElement("div");
	el.className = `toast toast--${type}`;
	el.textContent = message;
	root.appendChild(el);
	requestAnimationFrame(() => el.classList.add("toast--visible"));
	const hide = () => {
		el.classList.remove("toast--visible");
		setTimeout(() => el.remove(), 320);
	};
	const t = window.setTimeout(hide, duration);
	el.addEventListener("click", () => {
		window.clearTimeout(t);
		hide();
	});
}
