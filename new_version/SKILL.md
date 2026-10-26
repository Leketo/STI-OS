---
name: design-system-kanban-pm-kit
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation.
---

<!-- TYPEUI_SH_MANAGED_START -->

# Kanban PM Kit

## Mission
Deliver implementation-ready design-system guidance for Kanban PM Kit that can be applied consistently across dashboard web app interfaces.

## Brand
- Product/brand: Kanban PM Kit
- URL: https://kanban-pm-kit-code.vercel.app/projects/proj-1/board
- Audience: authenticated users and operators
- Product surface: dashboard web app

## Style Foundations
- Visual style: structured, accessible, implementation-first
- Main font style: `font.family.primary=Inter`, `font.family.stack=Inter, Inter Fallback, ui-sans-serif, system-ui, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=25.6px`
- Typography scale: `font.size.xs=12.8px`, `font.size.sm=14px`, `font.size.md=16px`
- Color palette: `color.text.primary=lab(95.3503 -0.411779 -1.83766)`, `color.text.secondary=lab(65.1232 -2.12994 -10.8536)`, `color.text.tertiary=lab(3.00549 -0.429377 -4.60005)`, `color.text.inverse=lab(90.6996 -0.806779 -3.66584)`, `color.surface.base=#000000`, `color.surface.muted=lab(8.26334 -1.16259 -8.83424)`, `color.surface.raised=lab(3.65259 -0.521936 -5.17953)`, `color.surface.strong=lab(64.03 0.423133 -62.0885)`, `color.border.default=lab(100 0 0 / 0.12)`, `color.border.strong=lab(100 0 0 / 0.15)`
- Spacing scale: `space.1=6px`, `space.2=8px`, `space.3=10px`, `space.4=12px`, `space.5=16px`, `space.6=24px`
- Radius/shadow/motion tokens: `radius.xs=8px`, `radius.sm=10px` | `shadow.1=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | `motion.duration.instant=150ms`, `motion.duration.fast=200ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, implementation-focused

## Rules: Do
- Use semantic tokens, not raw hex values in component guidance.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.

<!-- TYPEUI_SH_MANAGED_END -->
