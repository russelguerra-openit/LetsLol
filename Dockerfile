FROM node:22-bookworm-slim AS client-build
WORKDIR /src/letslol.client

COPY letslol.client/package*.json ./
RUN npm ci

COPY letslol.client/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS publish
WORKDIR /src

COPY LetsLol.Server/LetsLol.Server.csproj LetsLol.Server/
RUN dotnet restore LetsLol.Server/LetsLol.Server.csproj

COPY LetsLol.Server/ LetsLol.Server/
COPY --from=client-build /src/letslol.client/dist/ LetsLol.Server/wwwroot/

RUN dotnet publish LetsLol.Server/LetsLol.Server.csproj -c Release -o /app/publish /p:SkipSpaBuild=true

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
ENV PORT=10000

COPY --from=publish /app/publish ./

ENTRYPOINT ["sh", "-c", "dotnet LetsLol.Server.dll --urls http://0.0.0.0:${PORT:-10000}"]
