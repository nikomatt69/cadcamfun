# Feature parity with the original CADCAMFUN

Goal: everything the Next.js app does, rebuilt on Effect 4 + SolidJS. Ticked = done in `cadcamfun-next/`.

## 0. Foundations
- [x] CAD core (schemas, commands, undo), CAM core (toolpaths, feeds, posts), AI agent, HttpApi server, SolidJS editor

## 1. CAM libraries and toolpaths
- [ ] Tools, materials, machine configs: CRUD, clone, JSON import/export, DB-backed `CamLibrary`
- [ ] Saved toolpaths per project with versions, restore, comments
- [ ] G-code editor/viewer with simulation playback; Heidenhain post; fixed cycles (G81/G83)

## 2. Accounts
- [ ] Sign up / sign in (password + OAuth), sessions, profile, password change, settings
- [ ] Project ownership and access control

## 3. CAD parity
- [ ] More element types (text, ellipse, polygon, spline/NURBS, 3D primitives from the old library)
- [ ] Component library with versions, comments, relationships, export/import
- [ ] DXF / SVG / STL / JSON import-export; drawings per project
- [ ] Advanced snapping, transform toolbar, origin controls, workpiece setup

## 4. Collaboration
- [ ] Organizations, members, invitations
- [ ] Conversations and messages with realtime (WebSocket)
- [ ] Notifications and Web Push

## 5. AI parity
- [ ] G-code analysis and completion, toolpath analysis/optimizer, design analysis
- [ ] MCP server endpoint (assembly generation, CAD tools)

## 6. Plugins
- [ ] Registry, install, enable/disable, config, sandboxed SDK

## 7. Product
- [ ] Analytics, Stripe subscriptions and portal, pricing, waitlist, legal pages
- [ ] PWA/offline, OG images, sitemap

## 8. Desktop
- [ ] Tauri wrapper
