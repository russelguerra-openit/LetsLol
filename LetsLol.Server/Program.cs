using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using LetsLol.Server.Hubs;

namespace LetsLol.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Add services to the container.
            builder.Services.AddControllers();
            builder.Services.AddOpenApi();

            // SignalR
            builder.Services.AddSignalR();

            var repoClientDistPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "letslol.client", "dist"));

            if (builder.Environment.IsDevelopment())
            {
                // Allow the Vite dev server to connect during local development.
                builder.Services.AddCors(options =>
                {
                    options.AddPolicy("ViteDev", policy =>
                    {
                        policy.WithOrigins("https://localhost:57699", "http://localhost:57699")
                              .AllowAnyHeader()
                              .AllowAnyMethod()
                              .AllowCredentials(); // required for SignalR
                    });
                });
            }

            var app = builder.Build();
            var staticAssetPath = Directory.Exists(app.Environment.WebRootPath)
                ? app.Environment.WebRootPath
                : repoClientDistPath;

            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });

            if (Directory.Exists(staticAssetPath))
            {
                var staticAssetProvider = new PhysicalFileProvider(staticAssetPath);
                app.UseDefaultFiles(new DefaultFilesOptions
                {
                    FileProvider = staticAssetProvider,
                });
                app.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = staticAssetProvider,
                });
            }
            else
            {
                app.MapStaticAssets();
            }

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();

            if (app.Environment.IsDevelopment())
            {
                app.UseCors("ViteDev");
            }

            app.UseAuthorization();

            app.MapControllers();

            // SignalR hub endpoint
            app.MapHub<OfficeHub>("/hubs/office");

            if (Directory.Exists(staticAssetPath))
            {
                app.MapFallback(async context =>
                {
                    context.Response.ContentType = "text/html; charset=utf-8";
                    await context.Response.SendFileAsync(Path.Combine(staticAssetPath, "index.html"));
                });
            }
            else
            {
                app.MapFallbackToFile("/index.html");
            }

            app.Run();
        }
    }
}
