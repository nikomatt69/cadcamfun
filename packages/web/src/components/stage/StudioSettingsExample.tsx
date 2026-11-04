import { Bar, Icon, Row, Stage, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./StudioSettingsExample.css"

export type StudioExampleLabels = {
  account: string
  profile: string
  password: string
  git: string
  keys: string
  example: string
}

/** Illustrates the settings area without reading account data or exposing controls. */
export default function StudioSettingsExample({ labels }: { labels: StudioExampleLabels }) {
  const theme = useSiteTheme()
  return (
    <div aria-hidden="true">
      <Stage width={560} height={260} compact={{ below: 440, width: 358, height: 260 }} theme={theme} greys="cool" className="studio-example">
        {(_state, _rect, layout) => (
          <Window
            title={labels.account}
            toolbar={<Icon name="more" size={16} />}
            className="studio-example__window"
            sidebar={layout === "wide" ? (
              <div className="studio-example__sidebar">
                {[labels.profile, labels.password, labels.git, labels.keys].map((name, index) => (
                  <Row key={name} pad={7} selected={index === 3} title={<Text>{name}</Text>} />
                ))}
              </div>
            ) : undefined}
            sidebarWidth={150}
          >
            <div className="studio-example__content">
              <div className="studio-example__heading"><Text>{labels.keys}</Text><span>{labels.example}</span></div>
              <Row pad={10} selected lead={<Icon name="lock" size={16} />} title={<Text>{labels.example}</Text>} meta={<Icon name="chevron-right" size={14} />} />
              {[96, 74].map((width) => <Row key={width} pad={10} lead={<Bar w={16} h={16} r={5} tone={2} />} title={<Bar w={width} h={7} tone={2} />} meta={<Bar w={20} h={7} tone={2} />} />)}
            </div>
          </Window>
        )}
      </Stage>
    </div>
  )
}
