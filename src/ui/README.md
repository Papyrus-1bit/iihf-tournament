# UI Kit (FoxSports-inspired)

This folder contains a lightweight, class-based UI kit inspired by FoxSports layout patterns:
- dark background with red accent
- uppercase condensed typography
- segmented tabs and panel blocks
- high-contrast cards and stat rows

## Usage

Wrap any UI section with `UiRoot` to apply tokens:

```tsx
import { UiRoot, Panel, Button, Tabs, Tab } from "../ui";

<UiRoot>
  <Panel>
    <Tabs>
      <Tab active>Calendar</Tab>
      <Tab>Standings</Tab>
    </Tabs>
    <Button data-variant="primary">Simulate</Button>
  </Panel>
</UiRoot>
```

## Components
- `UiRoot`
- `Panel`
- `Card`
- `Button`
- `Tabs`, `Tab`
- `Input`, `Select`, `Textarea`
- `Tag`
- `SectionHeader`

## Preview
`src/ui/preview/UiPreview.tsx` contains a static preview.

We keep the main app on Chakra for now; migrate later by swapping components.
