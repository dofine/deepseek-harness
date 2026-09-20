/**
 * Browser half of dsh-transcript-toggle.
 *
 * Three display controls over the Chat target's own presentation, plus one live
 * activity line:
 *
 * 1. A Session-header button that flips the `ui-chat` conversation-display
 *    preference between `compact` (every covered closed Turn folds its tool
 *    calls and thinking behind its summary row) and `normal` (everything stays
 *    visible).
 * 2. A Session-header display menu with two switches kept in this browser's
 *    local storage, mirroring the `hideToolActivity` / `hideThinkingBlock`
 *    behavior another agent TUI offers: hide tool rows, hide thinking rows.
 *    Hiding is pure CSS over the rows the Chat target already renders, so it
 *    applies to a running Turn as well as a closed one.
 * 3. A composer-dock activity line for the running Turn: the tool call that is
 *    executing now, its elapsed seconds, and how many tool calls the Turn has
 *    made. It reads the transcript's own row attributes, so it refreshes in
 *    place while the Turn runs and disappears when the Turn settles.
 *
 * Bundle format: the closure factory every client row registers with the
 * browser module loader; `require` resolves module-table entries.
 */
window.__ModuleLoader__.load({
	id: "dsh-transcript-toggle",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { Button, IconEllipsisOutline16, IconThinkOutline16, Menu } = require("@deepseek-ai/dsh-client-ui-primitives");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

		/** This plugin's locale namespace. */
		const NS = "transcript-toggle";
		/** Namespace owned by the Chat target's host half. */
		const CHAT_NAMESPACE = "ui-chat";
		/** Field carrying the conversation-display mode inside that namespace. */
		const TRANSCRIPT_FIELD = "transcriptView";
		/** Mode that folds process rows; the Chat target's own default. */
		const FOLDED = "compact";
		const EXPANDED = "normal";

		/** Browser-local display switches owned by this plugin. */
		const HIDE_TOOLS_KEY = "dsh-transcript-toggle.hideToolActivity";
		const HIDE_THINKING_KEY = "dsh-transcript-toggle.hideThinkingBlock";
		/** Root attribute the injected rules key on. */
		const HIDE_TOOLS_ATTR = "data-dsh-tt-hide-tools";
		const HIDE_THINKING_ATTR = "data-dsh-tt-hide-thinking";
		/** One stylesheet for the hiding rules and the activity line. */
		const STYLE_ATTR = "data-dsh-transcript-toggle-css";

		const zh = {
			"action.fold": "收起工具与思考",
			"action.expand": "展开工具与思考",
			"hint.fold": "收起本会话的工具调用、思考过程与中间回复（对话显示：紧凑）",
			"hint.expand": "展开本会话的工具调用、思考过程与中间回复（对话显示：标准）",
			"menu.trigger": "显示设置",
			"menu.hideTools": "隐藏工具活动",
			"menu.hideThinking": "隐藏思考块",
			"menu.on": "已开启",
			"menu.off": "已关闭",
			"activity.running": "正在运行 {tool}",
			"activity.runningTimed": "正在运行 {tool} · {seconds}s",
			"activity.waiting": "等待模型回复",
			"activity.tools": "本轮 {count} 次工具调用",
		};
		const en = {
			"action.fold": "Hide tools & thinking",
			"action.expand": "Show tools & thinking",
			"hint.fold": "Fold this Session's tool calls, thinking, and intermediate replies (Conversation display: Compact)",
			"hint.expand": "Expand this Session's tool calls, thinking, and intermediate replies (Conversation display: Normal)",
			"menu.trigger": "Display options",
			"menu.hideTools": "Hide tool activity",
			"menu.hideThinking": "Hide thinking blocks",
			"menu.on": "On",
			"menu.off": "Off",
			"activity.running": "Running {tool}",
			"activity.runningTimed": "Running {tool} · {seconds}s",
			"activity.waiting": "Waiting for the model",
			"activity.tools": "{count} tool calls this Turn",
		};

		/** CSS the plugin owns: two hiding rules and the activity line. */
		const STYLE = [
			"html[" + HIDE_TOOLS_ATTR + '] [data-chat-flow-kind="tool-call"] { display: none !important; }',
			"html[" + HIDE_THINKING_ATTR + '] [data-variant="think"] { display: none !important; }',
			".dsh-tt-activity { display: inline-flex; align-items: center; gap: 6px; min-height: 20px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }",
			".dsh-tt-activity-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: dsh-tt-activity-pulse 1.2s ease-in-out infinite; }",
			".dsh-tt-activity-tool { color: var(--dsw-alias-label-secondary); }",
			"@keyframes dsh-tt-activity-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }",
		].join("\n");

		/** Read one stored switch; storage failures fall back to off. */
		function readFlag(key) {
			try {
				return window.localStorage.getItem(key) === "1";
			} catch (error) {
				if (error instanceof Error) return false;
				return false;
			}
		}

		/** Persist one switch; a browser that refuses storage keeps it session-local. */
		function writeFlag(key, value) {
			try {
				window.localStorage.setItem(key, value ? "1" : "0");
			} catch (error) {
				if (error instanceof Error) return;
			}
		}

		/** Install the plugin stylesheet once. */
		function installStyle() {
			if (document.querySelector("style[" + STYLE_ATTR + "]") !== null) return;
			const style = document.createElement("style");
			style.setAttribute(STYLE_ATTR, "");
			style.textContent = STYLE;
			document.head.appendChild(style);
		}

		/** Register the header controls, the hiding switches, and the activity line. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "transcript-toggle: dictionaries");
			ctx.effect(() => {
				installStyle();
				return () => {};
			}, "transcript-toggle: styles");

			const scope = ctx.settingsScope.bind({ namespace: CHAT_NAMESPACE });
			/** Live display mode; starts folded, matching the Chat target's default. */
			const mode = createSnapshotStore(FOLDED);
			const adopt = () => {
				const section = scope.getSnapshot().value;
				const next = section === null || section === undefined
					? undefined
					: section[TRANSCRIPT_FIELD];
				if (typeof next === "string" && next !== mode.getSnapshot()) mode.set(next);
			};
			ctx.effect(() => scope.subscribe(adopt), "transcript-toggle: settings");
			adopt();
			const toggleFold = () => {
				const next = mode.getSnapshot() === FOLDED ? EXPANDED : FOLDED;
				mode.set(next);
				void scope.set(TRANSCRIPT_FIELD, next);
			};

			/** Browser-local hiding switches, applied to the root element. */
			const hidden = createSnapshotStore({
				tools: readFlag(HIDE_TOOLS_KEY),
				thinking: readFlag(HIDE_THINKING_KEY),
			});
			const applyHidden = () => {
				const state = hidden.getSnapshot();
				document.documentElement.toggleAttribute(HIDE_TOOLS_ATTR, state.tools);
				document.documentElement.toggleAttribute(HIDE_THINKING_ATTR, state.thinking);
			};
			ctx.effect(() => {
				applyHidden();
				return hidden.subscribe(applyHidden);
			}, "transcript-toggle: hiding rules");
			const toggleHidden = (key) => {
				const state = hidden.getSnapshot();
				const next = { ...state, [key]: !state[key] };
				hidden.set(next);
				writeFlag(key === "tools" ? HIDE_TOOLS_KEY : HIDE_THINKING_KEY, next[key]);
			};

			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "transcript-toggle",
				order: 40,
				locale: NS,
				inject: () => ({ hooks: { mode }, toggle: toggleFold }),
			}, FoldButton));

			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "transcript-display-menu",
				order: 41,
				locale: NS,
				inject: () => ({ hooks: { hidden }, toggleHidden }),
			}, DisplayMenu));

			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "transcript-activity",
				order: 10,
				locale: NS,
			}, ActivityLine));
		}

		/**
		 * Render the fold toggle through the header's own button primitive, so it
		 * sits in the same visual family as the controls beside it. The label names
		 * the action the click performs.
		 * @param props - slot props plus the injected mode source and toggle callback.
		 * @returns the header button.
		 */
		function FoldButton(props) {
			const mode = props.useMode(value => value);
			const folded = mode === FOLDED;
			return react.createElement(Button, {
				variant: "outline",
				size: "sm",
				icon: react.createElement(IconThinkOutline16, { size: 14 }),
				"aria-pressed": folded,
				title: props.t(folded ? "hint.expand" : "hint.fold"),
				onClick: () => { props.toggle(); },
			}, props.t(folded ? "action.expand" : "action.fold"));
		}

		/**
		 * Render the display-options menu: the two browser-local hiding switches,
		 * each labeled with the action it performs and marked when active.
		 * @param props - slot props plus the injected switch source and toggler.
		 * @returns the menu button with its dropdown.
		 */
		function DisplayMenu(props) {
			const [open, setOpen] = react.useState(false);
			const switches = props.useHidden(value => value);
			const items = [
				{ id: "tools", label: label(props.t, "menu.hideTools", switches.tools) },
				{ id: "thinking", label: label(props.t, "menu.hideThinking", switches.thinking) },
			];
			const trigger = react.createElement(Button, {
				variant: "outline",
				size: "sm",
				icon: react.createElement(IconEllipsisOutline16, { size: 14 }),
				"aria-haspopup": "menu",
				"aria-expanded": open,
				"aria-label": props.t("menu.trigger"),
				title: props.t("menu.trigger"),
				onClick: () => { setOpen(value => !value); },
			});
			return react.createElement(Menu, {
				open,
				onClose: () => { setOpen(false); },
				items,
				onSelect: (id) => {
					setOpen(false);
					props.toggleHidden(id);
				},
				align: "end",
				portal: true,
				anchor: trigger,
			});
		}

		/** Mark one switch's current state beside its name. */
		function label(t, key, on) {
			return (on ? "✓ " : "") + t(key) + " — " + t(on ? "menu.on" : "menu.off");
		}

		/**
		 * Render the running Turn's tool activity. Facts come from the transcript
		 * rows the Chat target already published: the newest Turn that owns tool
		 * rows, whether one of them is still running, and its tool name.
		 * @param props - dock slot props with the plugin locale seat.
		 * @returns the activity line, or null while no Turn is running.
		 */
		function ActivityLine(props) {
			const [state, setState] = react.useState(null);
			const startedAt = react.useRef(0);
			const startedKey = react.useRef("");
			react.useEffect(() => {
				let frame = 0;
				let timer = 0;
				const read = () => {
					frame = 0;
					const seats = Array.from(document.querySelectorAll('[data-chat-flow-kind="tool-call"]'));
					const last = seats[seats.length - 1];
					const turn = last === undefined ? undefined : last.getAttribute("data-chat-turn");
					const own = turn === undefined
						? []
						: seats.filter(seat => seat.getAttribute("data-chat-turn") === turn);
					const runningSeat = [...own].reverse().find(seat => seat.querySelector('[data-state="running"]') !== null);
					const runningTool = runningSeat === undefined
						? undefined
						: runningSeat.querySelector("[data-tool]")?.getAttribute("data-tool") ?? "tool";
					const live = document.querySelector('[data-conversation-scroll] [role="status"]') !== null;
					const key = String(turn) + ":" + String(runningTool ?? "") + ":" + String(own.length);
					if (key !== startedKey.current) {
						startedKey.current = key;
						startedAt.current = Date.now();
					}
					const seconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
					const next = live && own.length > 0
						? { tool: runningTool, count: own.length, seconds }
						: null;
					setState(current => sameActivity(current, next) ? current : next);
					if (next !== null && next.tool !== undefined && timer === 0) {
						timer = window.setInterval(read, 1000);
					}
					if ((next === null || next.tool === undefined) && timer !== 0) {
						window.clearInterval(timer);
						timer = 0;
					}
				};
				const schedule = () => {
					if (frame !== 0) return;
					frame = window.requestAnimationFrame(read);
				};
				const root = document.querySelector("[data-conversation-scroll]");
				const observer = root === null ? null : new MutationObserver(schedule);
				if (root !== null && observer !== null) {
					observer.observe(root, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: ["data-state", "data-tool"],
					});
				}
				read();
				return () => {
					if (frame !== 0) window.cancelAnimationFrame(frame);
					if (timer !== 0) window.clearInterval(timer);
					observer?.disconnect();
				};
			}, []);
			if (state === null) return null;
			const t = props.t;
			const text = state.tool === undefined
				? t("activity.waiting")
				: state.seconds >= 5
					? t("activity.runningTimed", { tool: state.tool, seconds: state.seconds })
					: t("activity.running", { tool: state.tool });
			const counts = t("activity.tools", { count: state.count });
			// The parts are laid out with a flex gap, so the accessible name joins
			// them explicitly instead of running the words together.
			return react.createElement("div", {
				className: "dsh-tt-activity",
				role: "status",
				"aria-label": text + " · " + counts,
			},
				react.createElement("span", { className: "dsh-tt-activity-dot", "aria-hidden": true }),
				react.createElement("span", { className: "dsh-tt-activity-tool", "aria-hidden": true }, text),
				react.createElement("span", { "aria-hidden": true }, counts));
		}

		/** Compare two derived activity states by value. */
		function sameActivity(left, right) {
			if (left === right) return true;
			if (left === null || right === null) return false;
			return left.tool === right.tool && left.count === right.count && left.seconds === right.seconds;
		}

		exports.inject = ["slots", "settingsScope", "locale"];
		exports.apply = apply;
		return module.exports;
	}
});
