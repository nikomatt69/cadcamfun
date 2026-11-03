import { Bell } from "lucide-react"
import { Bar, LockScreen, Notification, Phone, Stage, Text, WALLPAPER, Window } from "../../stageshow/kit"
import { PartView } from "./PartView"
import { useSiteTheme } from "./useSiteTheme"
import "./workbench.css"
import "./downloadshot.css"

// The desktop app and its phone companion telling one event: the toolpath is
// done on the desktop, the phone says so. A still.

export default function DownloadShot() {
  const theme = useSiteTheme()
  return (
    <Stage width={720} height={320} compact={{ below: 520, width: 358, height: 320 }} theme={theme} greys="cool" className="dl">
      {() => (
        <>
          <Window
            title="Bracket"
            className="dl-window"
            sidebar={
              <div className="dl-side">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="dl-step">
                    <Bar w={10} h={10} r={3} tone={i === 2 ? 4 : 3} />
                    {i === 2 ? <Text>Pocket</Text> : <Bar w={i ? 40 : 52} h={6} tone={2} />}
                  </div>
                ))}
              </div>
            }
            sidebarWidth={120}
          >
            <div className="wb-view">
              <PartView pocket path />
            </div>
          </Window>
          <Phone width={190} frame="pro" dark wallpaper={WALLPAPER} className="dl-phone">
            <LockScreen size="satellite" time="9:41" date="Tuesday 3 November">
              <Notification icon={<Bell size={14} />} title="Toolpath ready" body="Pocket 1 posted · 04:12" />
            </LockScreen>
          </Phone>
        </>
      )}
    </Stage>
  )
}
