# Render Deployment

This app is set up to run on Render's free web service as a single Dockerized ASP.NET app.

## What the deployment does

- Builds the Vite client.
- Copies the client build into `LetsLol.Server/wwwroot`.
- Publishes the ASP.NET app.
- Runs the app on Render's assigned `PORT`.

## Deploy steps

1. Push this repository to GitHub.
2. In Render, create a new **Web Service** from the GitHub repo.
3. Render should detect `render.yaml` and use the Docker runtime automatically.
4. Keep the plan on **Free**.
5. Deploy.

## Notes

- The app serves the frontend and backend from the same origin, so SignalR stays simple in production.
- Render free services spin down after inactivity. Expect cold starts.
