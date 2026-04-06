# openmarkdown

A polished terminal markdown viewer built with OpenTUI.

## Install

```bash
npm install -g openmarkdown
```

`openmarkdown` requires Bun at runtime. Install Bun first:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Usage

```bash
openmarkdown README.md
```

Or pipe content in:

```bash
cat README.md | openmarkdown -
```

## Development

```bash
npm install
npm run dev
```

## Publish

```bash
npm login
npm publish
```
