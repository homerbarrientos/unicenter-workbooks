import type{Metadata}from"next";import"./globals.css";
export const metadata:Metadata={title:"UNICENTER 2.0 Control Center",description:"Dynamic 60-day stabilization and control dashboard"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
