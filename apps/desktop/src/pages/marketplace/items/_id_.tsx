import { useParams } from "@solidjs/router"
import { MarketplaceScreen } from "../../../screens/marketplace.tsx"
export default function Page() {
  const params = useParams<{ id: string }>()
  return <MarketplaceScreen view="item" id={params.id} />
}