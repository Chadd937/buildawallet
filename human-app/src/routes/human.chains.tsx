import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";
import { chainOptions } from "@/lib/wallet-data";
export const Route=createFileRoute("/human/chains")({head:()=>({meta:[{title:"Choose Chains | BuildAWallet"},{name:"description",content:"Select the blockchain networks for your wallet."},{property:"og:title",content:"Choose Chains | BuildAWallet"},{property:"og:description",content:"Build a wallet across your favorite networks."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <SetupPage step={3} eyebrow="03 / Networks" title="Choose your universe." description="Go focused or go multichain. Pick every network your wallet should understand." field="chains" multiple next="/human/security" back="/human/custody" choices={chainOptions.map(([name,icon,detail])=>({name,icon,detail}))}/>}
