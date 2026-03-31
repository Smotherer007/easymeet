/**
 * Focus trap for modal dialogs: focus first focusable on activate, cycle Tab, restore focus on deactivate.
 */

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(root) {
	return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => {
		try {
			return el.offsetParent !== null || el.getClientRects().length > 0;
		} catch {
			return false;
		}
	});
}

/**
 * @param {HTMLElement} root
 * @returns {{ activate: () => void; deactivate: () => void }}
 */
export function createFocusTrap(root) {
	if (!root) {
		return {
			activate: () => {},
			deactivate: () => {}
		};
	}
	/** @type {Element | null} */
	let previous = null;

	function onKeyDown(e) {
		if (e.key !== "Tab") return;
		const list = listFocusable(root);
		if (list.length === 0) return;
		const first = list[0];
		const last = list[list.length - 1];
		const active = document.activeElement;
		if (e.shiftKey) {
			if (active === first || !root.contains(active)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	return {
		activate() {
			previous = document.activeElement;
			const list = listFocusable(root);
			const target = list[0] || root;
			requestAnimationFrame(() => {
				try {
					target.focus();
				} catch {
					/* ignore */
				}
			});
			root.addEventListener("keydown", onKeyDown);
		},
		deactivate() {
			root.removeEventListener("keydown", onKeyDown);
			if (previous && typeof previous.focus === "function") {
				try {
					previous.focus();
				} catch {
					/* ignore */
				}
			}
			previous = null;
		}
	};
}
