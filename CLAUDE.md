# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a small repository of utility scripts and web projects created with Claude Code. The main goal is to provide quick, useful tools that are easy to run and extend.

## Commands

### Running Projects
- **Tic Tac Toe**: Open `tictactoe.html` in any web browser (no build process required)
- **today.js**: Run with Node.js: `node today.js`

### Git Workflow
The repository follows a strict workflow:
- Always use clear, descriptive commit messages
- Commit and push changes to GitHub after each substantive change
- GitHub repo: https://github.com/samgod15/omniroute
- Remote is set up as `origin` pointing to the master branch

## Architecture

### Tic Tac Toe Game (`tictactoe.html`)
- Single-file HTML game (all CSS and JS embedded)
- Uses vanilla JavaScript with DOM manipulation
- State managed in `boardState` array and `currentPlayer` variable
- No external dependencies (works standalone)

### today.js
- Simple Node.js script demonstrating CLI utility pattern
- Prints date and PowerShell tips using Node's built-in Date object

## Development Philosophy

- Keep projects self-contained and simple
- Avoid complex build processes for small utilities
- Focus on "good enough" solutions over complex architectures
- All web content uses vanilla technologies (no frameworks)

## Local Development Notes

- No local development server required for HTML projects
- For Node.js scripts, run from repository root
- GitHub repository is the primary source of truth