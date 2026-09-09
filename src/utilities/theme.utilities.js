export const githubDarkTheme = {
  base: 'vs-dark',
  inherit: false,
  colors: {
    'editor.foreground': '#d1d7e0',
    'editor.background': '#212830',
    'editorWidget.background': '#212830',
    'editor.foldBackground': '#293038',
    'editor.lineHighlightBackground': '#292E36',
    'editorLineNumber.foreground': '#9198A1',
    'editorLineNumber.activeForeground': '#d1d7e0',
    'editorWhitespace.foreground': '#4d5b6a',
    'editorCursor.foreground': '#d1d7e0',
    'editor.findMatchBackground': '#867647',
    'editor.findMatchHighlightBackground': '#867647',
    'editor.wordHighlightBackground': '#434a55',
    'editor.wordHighlightBorder': '#56606c',
    'editor.wordHighlightStrongBackground': '#434a55',
    'editor.wordHighlightStrongBorder': '#56606c',
    'editorBracketMatch.background': '#292E36',
    'editorBracketMatch.border': '#292E36',
    'editorBracketHighlight.foreground1': '#d1d7e0',
    'editorBracketHighlight.foreground2': '#d1d7e0',
    'editorBracketHighlight.foreground3': '#d1d7e0',
    'editorBracketHighlight.foreground4': '#d1d7e0',
    'editorBracketHighlight.foreground5': '#d1d7e0',
    'editorBracketHighlight.foreground6': '#d1d7e0'
  },
  rules: [
    {
      token: 'number',
      foreground: '#6CB6FF'
    },
    {
      token: 'comment',
      foreground: '#9198A1'
    },
    {
      token: 'keyword',
      foreground: '#f47067'
    },
    {
      token: 'string',
      foreground: '#96D0FF'
    }
  ]
};

/**
 * Light counterpart, using GitHub Light's values.
 *
 * Monaco needs a real theme object rather than CSS variables, so the two
 * themes are defined side by side here. The token colours match the
 * `--c-str`, `--c-num`, `--c-kw` tokens in index.css, so a value reads the
 * same on both sides of the pane in either theme.
 */
export const githubLightTheme = {
  base: 'vs',
  inherit: false,
  colors: {
    'editor.foreground': '#1f2328',
    'editor.background': '#ffffff',
    'editorWidget.background': '#ffffff',
    'editor.foldBackground': '#eaeef2',
    'editor.lineHighlightBackground': '#f6f8fa',
    'editorLineNumber.foreground': '#8c959f',
    'editorLineNumber.activeForeground': '#1f2328',
    'editorWhitespace.foreground': '#afb8c1',
    'editorCursor.foreground': '#1f2328',
    'editor.findMatchBackground': '#ffdf5d',
    'editor.findMatchHighlightBackground': '#fae17d',
    'editor.wordHighlightBackground': '#eaeef2',
    'editor.wordHighlightBorder': '#d0d7de',
    'editor.wordHighlightStrongBackground': '#eaeef2',
    'editor.wordHighlightStrongBorder': '#d0d7de',
    'editorBracketMatch.background': '#f6f8fa',
    'editorBracketMatch.border': '#f6f8fa',
    'editorBracketHighlight.foreground1': '#1f2328',
    'editorBracketHighlight.foreground2': '#1f2328',
    'editorBracketHighlight.foreground3': '#1f2328',
    'editorBracketHighlight.foreground4': '#1f2328',
    'editorBracketHighlight.foreground5': '#1f2328',
    'editorBracketHighlight.foreground6': '#1f2328'
  },
  rules: [
    {
      token: 'number',
      foreground: '#0550AE'
    },
    {
      token: 'comment',
      foreground: '#6E7781'
    },
    {
      token: 'keyword',
      foreground: '#CF222E'
    },
    {
      token: 'string',
      foreground: '#0A3069'
    }
  ]
};

/** Monaco theme name for a resolved appearance. */
export const monacoThemeFor = appearance =>
  appearance === 'light' ? 'github-light-theme' : 'github-dark-theme';
