import { Shopify } from "@shopify/shopify-api";

import topLevelAuthRedirect from "../helpers/top-level-auth-redirect.js";
import { MongoClient, ServerApiVersion } from 'mongodb';

export default function applyAuthMiddleware(app) {
  app.get("/auth", async (req, res) => {

    console.log("auth",req.query.shop)
    if (!req.signedCookies[app.get("top-level-oauth-cookie")]) {
      return res.redirect(`/auth/toplevel?shop=${req.query.shop}`);
    }

    const redirectUrl = await Shopify.Auth.beginAuth(
      req,
      res,
      req.query.shop,
      "/auth/callback",
      app.get("use-online-tokens")
    );

    res.redirect(redirectUrl);
  });

  app.get("/auth/toplevel", (req, res) => {
    console.log("/auth/toplevel",req.query.shop)
    res.cookie(app.get("top-level-oauth-cookie"), "1", {
      signed: true,
      httpOnly: true,
      sameSite: "strict",
    });

    res.set("Content-Type", "text/html");

    res.send(
      topLevelAuthRedirect({
        apiKey: Shopify.Context.API_KEY,
        hostName: Shopify.Context.HOST_NAME,
        shop: req.query.shop,
      })
    );
  });

  app.get("/auth/callback", async (req, res) => {
    console.log("/auth/callback",req.query.shop)
    try {
      const session = await Shopify.Auth.validateAuthCallback(
        req,
        res,
        req.query
      );

      console.log(session);

      const host = req.query.host;
      app.set(
        "active-shopify-shops",
        Object.assign(app.get("active-shopify-shops"), {
          [session.shop]: session.scope,
        })
      );

      // const response = await Shopify.Webhooks.Registry.register({
      //   shop: req.query.shop,
      //   accessToken: session.accessToken,
      //   topic: "APP_UNINSTALLED",
      //   path: "/webhooks",
      // });

      // if (!response["APP_UNINSTALLED"].success) {
      //   console.log(
      //     `Failed to register APP_UNINSTALLED webhook: ${response.result}`
      //   );
      // }
      const uri = "mongodb+srv://lari:pranavlari@cluster0.lqo0h.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
      const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
      client.connect(err => {
        const collection = client.db("projectx").collection("stores");
        var shop = { shop_url: session.shop, access_token: session.accessToken};
        collection.insertOne(shop, function(err, res) {
          if (err) throw err;
          client.close();

        });
        // client.close();

      });
      // Redirect to app with shop parameter upon auth
      res.redirect(`/?shop=${session.shop}&host=${host}`);
    } catch (e) {
      switch (true) {
        case e instanceof Shopify.Errors.InvalidOAuthError:
          res.status(400);
          res.send(e.message);
          break;
        case e instanceof Shopify.Errors.CookieNotFound:
        case e instanceof Shopify.Errors.SessionNotFound:
          // This is likely because the OAuth session cookie expired before the merchant approved the request
          res.redirect(`/auth?shop=${req.query.shop}`);
          break;
        default:
          res.status(500);
          res.send(e.message);
          break;
      }
    }
  });
}
