// 核心防线：检测 React Hooks 顺序问题（如 #310 "Rendered more hooks than during the previous render"）
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["client/**/*.ts", "client/**/*.tsx", "index.client.tsx"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
];
