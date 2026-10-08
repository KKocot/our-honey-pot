# Font licenses

All fonts are self-hosted variable fonts (weight axis, latin + latin-ext subsets), installed from Fontsource npm packages and bundled at build time by `src/styles/fonts.css`. Each font is licensed under the [SIL Open Font License, Version 1.1](https://openfontlicense.org/open-font-license-official-text/). The full license text ships in each package at `node_modules/@fontsource-variable/<package>/LICENSE`.

| id               | Font                       | Package                                                 | Copyright                                                          | Source                                                    | License |
| ---------------- | -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- | ------- |
| `inter`          | Inter                      | `@fontsource-variable/inter@5.3.0`                      | Copyright 2016 The Inter Project Authors                           | https://github.com/rsms/inter                             | OFL-1.1 |
| `source-serif`   | Source Serif 4             | `@fontsource-variable/source-serif-4@5.3.0`             | Copyright Adobe, with Reserved Font Name 'Source'                  | https://github.com/adobe-fonts/source-serif               | OFL-1.1 |
| `fraunces`       | Fraunces                   | `@fontsource-variable/fraunces@5.3.0`                   | Copyright 2020 The Fraunces Project Authors                        | https://github.com/undercasetype/Fraunces                 | OFL-1.1 |
| `space-grotesk`  | Space Grotesk              | `@fontsource-variable/space-grotesk@5.3.0`              | Copyright 2020 The Space Grotesk Project Authors                   | https://github.com/floriankarsten/space-grotesk           | OFL-1.1 |
| `jetbrains-mono` | JetBrains Mono             | `@fontsource-variable/jetbrains-mono@5.3.0`             | Copyright 2020 The JetBrains Mono Project Authors                  | https://github.com/JetBrains/JetBrainsMono                | OFL-1.1 |
| `atkinson`       | Atkinson Hyperlegible Next | `@fontsource-variable/atkinson-hyperlegible-next@5.3.0` | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors | https://github.com/googlefonts/atkinson-hyperlegible-next | OFL-1.1 |

`system` uses the platform `system-ui` font stack and ships no font files.
