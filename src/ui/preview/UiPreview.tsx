import UiRoot from "../UiRoot";
import Panel from "../Panel";
import Card from "../Card";
import Button from "../Button";
import { Tabs, Tab } from "../Tabs";
import { Input, Select } from "../Input";
import Tag from "../Tag";
import SectionHeader from "../SectionHeader";

const UiPreview = () => {
  return (
    <UiRoot>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <h1 className="ui-title">IIHF Tournament Hub</h1>
          <Tabs>
            <Tab active>Calendar</Tab>
            <Tab>Standings</Tab>
            <Tab>Playoffs</Tab>
            <Tab>Ratings</Tab>
          </Tabs>
        </div>

        <Panel>
          <SectionHeader>Match Center</SectionHeader>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Tag>Regular Season</Tag>
              <Tag className="ui-mono">NOV 20, 2025</Tag>
              <Tag>Game 5</Tag>
            </div>
            <div className="ui-grid two">
              <Card>
                <SectionHeader>Los Angeles</SectionHeader>
                <h2 className="ui-title" style={{ fontSize: 22 }}>Kings</h2>
                <div className="ui-stat"><span>Record</span><strong>12-6-2</strong></div>
                <div className="ui-stat"><span>Last 10</span><strong>8-2-0</strong></div>
              </Card>
              <Card>
                <SectionHeader>San Jose</SectionHeader>
                <h2 className="ui-title" style={{ fontSize: 22 }}>Sharks</h2>
                <div className="ui-stat"><span>Record</span><strong>12-8-0</strong></div>
                <div className="ui-stat"><span>Last 10</span><strong>6-4-0</strong></div>
              </Card>
            </div>
          </div>
        </Panel>

        <Panel strong>
          <SectionHeader>Quick Controls</SectionHeader>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button data-variant="primary">Simulate Day</Button>
            <Button>Save</Button>
            <Button data-variant="ghost">Export</Button>
          </div>
          <div className="ui-divider" />
          <div className="ui-grid two">
            <label style={{ display: "grid", gap: 6 }}>
              <span className="ui-subtitle">Tournament Name</span>
              <Input placeholder="IIHF 2026" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="ui-subtitle">Playoff Rule</span>
              <Select>
                <option>Seeded</option>
                <option>Cross-Group</option>
                <option>Random</option>
              </Select>
            </label>
          </div>
        </Panel>
      </div>
    </UiRoot>
  );
};

export default UiPreview;
