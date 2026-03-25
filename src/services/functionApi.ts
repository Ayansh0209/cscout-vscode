import net from "net";

export function makeRequest(path: string): Promise<any[]> {
    return new Promise((resolve) => {

        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {
                const request =
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`;

                client.write(request);
            }
        );

        let data = "";

        client.on("data", chunk => {
            data += chunk.toString();
        });

        client.on("end", () => {
            try {
                const body = data.split("\r\n\r\n")[1] || data;
                const parsed = JSON.parse(body);
                resolve(parsed);
            } catch (err) {
                console.error("[Network] JSON parse error:", err);
                resolve([]);
            }
        });

        client.on("error", (err) => {
            console.error("[Network] Socket error:", err);
            resolve([]);
        });
    });
}