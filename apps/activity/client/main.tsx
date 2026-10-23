// SPDX-License-Identifier: Apache-2.0
import { createRoot } from "react-dom/client";
import "virtual:shenron-tokens.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<App />);
