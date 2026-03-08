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

            var clientDistPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "letslol.client", "dist"));

            // CORS – allow the Vite dev server to connect
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

            var app = builder.Build();

            if (Directory.Exists(clientDistPath))
            {
                var clientDistProvider = new PhysicalFileProvider(clientDistPath);
                app.UseDefaultFiles(new DefaultFilesOptions
                {
                    FileProvider = clientDistProvider,
                });
                app.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = clientDistProvider,
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

            app.UseCors("ViteDev");

            app.UseAuthorization();

            app.MapControllers();

            // SignalR hub endpoint
            app.MapHub<OfficeHub>("/hubs/office");

            if (Directory.Exists(clientDistPath))
            {
                app.MapFallback(async context =>
                {
                    context.Response.ContentType = "text/html; charset=utf-8";
                    await context.Response.SendFileAsync(Path.Combine(clientDistPath, "index.html"));
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
