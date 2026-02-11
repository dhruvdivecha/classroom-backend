import type { Request, Response, NextFunction } from "express";
import type { RateLimitRole } from "../type.js";
import  aj  from "../config/arcjet.js";
import { slidingWindow, ArcjetNodeRequest} from "@arcjet/node";

const securityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if(process.env.NODE_ENV === "test") return next();

    try {
        const role: RateLimitRole = req.user?.role || "guest";

    let limit: number;
    let message: string;

        switch (role) {
            case "admin":
                limit=20;
                message="Admin request limit exceeded (20 per minute). Please try again later.";
                break;
            case "teacher":
                limit=10;
                message="Teacher request limit exceeded (10 per minute). Please try again later.";
                break;
            case "student":
                limit=10;
                message="Student request limit exceeded (10 per minute). Please try again later.";
                break;
            case "guest":
                limit=5;
                message="Guest request limit exceeded (5 per minute). Sign in to increase your limit.";
                break;
            default:
                limit=5;
                message="Request limit exceeded. Please try again later.";
                break;
        }

        const client = aj.withRule(
            slidingWindow({
                mode: 'LIVE',
                interval: '1m',
                max: limit,
            })
        )

        const arcjetRequest: ArcjetNodeRequest = {
            headers: req.headers,
            method: req.method,
            url: req.originalUrl ?? req.url,
            socket: {
                remoteAddress: req.socket.remoteAddress ?? req.ip ?? '0.0.0.0'
            },
        }

        const decision = await client.protect(arcjetRequest);

        if (decision.isDenied() && decision.reason.isBot()) {
            return res.status(403).json({ error: 'Forbidden' ,message: "Automated requests are denied." });
        }
        if (decision.isDenied() && decision.reason.isShield()) {
            return res.status(403).json({ error: 'Forbidden' ,message: "Request blocked by security rules." });
        }
        if (decision.isDenied() && decision.reason.isRateLimit()) {
            return res.status(429).json({ error: 'Too many requests.', message: "Too many requests."});
        }

        next();


    }catch (error) {
        console.error("Arcjet middleware error:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Something went wrong with the security middleware.",
        });

    }
};

export default securityMiddleware;