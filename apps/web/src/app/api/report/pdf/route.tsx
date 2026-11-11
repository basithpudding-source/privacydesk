// The monthly report as a PDF: the same text as the page, with the client's name and colour.
// Built on the server with @react-pdf/renderer, so no browser is needed. The data comes
// through the user's own session, so row-level security applies exactly as on the page.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { monthLabel } from "@/lib/report/build";
import { getReport, parseMonth } from "@/lib/report/queries";
import { todayInLondon } from "@/lib/today";

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.5, color: "#1a1a1a" },
  band: { height: 6, width: 72, borderRadius: 3, marginBottom: 14 },
  org: { fontSize: 10, color: "#666666", marginBottom: 2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  line: { marginBottom: 2 },
  bullet: { marginLeft: 12, marginBottom: 2 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8.5, color: "#666666" },
});

function ReportPdf({ orgName, colour, month, text }: { orgName: string; colour: string; month: string; text: string }) {
  const lines = text.split("\n");
  const body = lines.slice(2, -2); // the first line is the title, the last the "Prepared" footer
  const footer = lines[lines.length - 1];
  return (
    <Document title={`${orgName}: data protection cases, ${monthLabel(month)}`} author="Privacy Desk">
      <Page size="A4" style={styles.page}>
        <View style={[styles.band, { backgroundColor: colour }]} />
        <Text style={styles.org}>{orgName}</Text>
        <Text style={styles.title}>Data protection cases, {monthLabel(month)}</Text>
        {body.map((l, i) =>
          l === "" ? (
            <View key={i} style={{ height: 6 }} />
          ) : l.startsWith("- ") ? (
            <Text key={i} style={styles.bullet}>• {l.slice(2)}</Text>
          ) : l === "Open cases" || l === "Closed this month" ? (
            <Text key={i} style={styles.heading}>{l}</Text>
          ) : (
            <Text key={i} style={styles.line}>{l}</Text>
          ),
        )}
        <Text style={styles.footer} fixed>{footer}</Text>
      </Page>
    </Document>
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.membership) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const today = todayInLondon();
  const clientId = request.nextUrl.searchParams.get("client") ?? "";
  const month = parseMonth(request.nextUrl.searchParams.get("month") ?? undefined, today);
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return NextResponse.json({ error: "Choose a client." }, { status: 400 });

  const report = await getReport(clientId, month, today);
  if (!report) return NextResponse.json({ error: "That client is not here." }, { status: 404 });

  const pdf = await renderToBuffer(<ReportPdf orgName={report.org.name} colour={report.org.colour} month={month} text={report.text} />);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.org.code}-${month}-report.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
