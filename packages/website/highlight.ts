/**
 * Highlights code in pages as they're built, so pages ship colored HTML
 * without a script. Pages mark code with `data-language` on its `pre`:
 *
 * ```nix
 * html.pre { data-language = "nix"; } source
 * ```
 */

import { createHighlighter } from "shiki";
import type { Plugin } from "vite";

const THEME = "one-dark-pro";
const LANGUAGES = ["css", "html", "javascript", "jsonc", "nix", "typescript"];

/** A `pre` marked with a language, and its contents. */
const BLOCK =
  /(<pre\b[^>]*\bdata-language="([^"]+)"[^>]*>)([\s\S]*?)(<\/pre>)/g;

export default function highlight(): Plugin {
  const highlighter = createHighlighter({
    themes: [THEME],
    langs: LANGUAGES,
  });

  return {
    name: "highlight",

    async transformIndexHtml(html) {
      const shiki = await highlighter;

      return html.replace(BLOCK, (_, open, language, source, close) => {
        const { tokens } = shiki.codeToTokens(unescape(source), {
          lang: language,
          theme: THEME,
        });

        const lines = tokens.map((line) =>
          line
            .map(
              (token) =>
                `<span style="color:${token.color}">${escape(token.content)}</span>`,
            )
            .join(""),
        );

        return `${open}${lines.join("\n")}${close}`;
      });
    },
  };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Text as it was before rendering into HTML. */
const unescape = (html: string) =>
  html.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]!);

/** Text safe to place in HTML. */
const escape = (text: string) =>
  text.replace(
    /[&<>]/g,
    (char) => `&${{ "&": "amp", "<": "lt", ">": "gt" }[char]};`,
  );
