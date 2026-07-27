import { Snaptrade } from "snaptrade-typescript-sdk";

const snaptrade = new Snaptrade({
  clientId: "PERS-XKI3EVCCAD5854MC2YDH",
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
});

const userId = process.env.SNAPTRADE_USER_ID;
const userSecret = process.env.SNAPTRADE_USER_SECRET;

async function main() {
  const { data: connections } = await snaptrade.connections.listBrokerageAuthorizations({
    userId,
    userSecret,
  });
  console.log(`${connections.length} connexion(s) trouvée(s):`);
  console.dir(connections, { depth: null });

  if (connections.length === 0) {
    console.error("Aucune connexion trouvée.");
    return;
  }

  const wealthsimple = connections[0];

  const { data: login } = await snaptrade.authentication.loginSnapTradeUser({
    userId,
    userSecret,
    reconnect: wealthsimple.id,
    connectionType: "trade",
  });

  console.log("\nOuvre ce lien et reconnecte-toi à Wealthsimple:\n");
  console.log(login.redirectURI);
}

main().catch(console.error);
