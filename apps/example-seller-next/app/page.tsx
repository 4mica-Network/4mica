export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>4Mica x402 seller</h1>
      <p>
        <code>GET /api/protected</code> is paywalled by{" "}
        <code>@4mica/sdk-next</code>. Run the buyer example to pay for it, or:
      </p>
      <pre>curl -i http://localhost:3002/api/protected</pre>
    </main>
  );
}
