"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../server/db";
import {
    canvas,
    chatHistory,
    chatThreads,
    contentToSpace,
    space,
    spacesAccess,
    storedContent,
    users,
} from "../../server/db/schema";
import { ServerActionReturnType } from "./types";
import { auth } from "../../server/auth";
import { Tweet } from "react-tweet/api";
import { getMetaData } from "@/lib/get-metadata";
import { and, eq, inArray, sql } from "drizzle-orm";
import { LIMITS } from "@/lib/constants";
import { ChatHistory } from "@repo/shared-types";
import { decipher } from "@/server/encrypt";
import { redirect } from "next/navigation";
import { tweetToMd } from "@repo/shared-types/utils";
import { ensureAuth } from "../api/ensureAuth";
import { getRandomSentences } from "@/lib/utils";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const completeOnboarding = async (): ServerActionReturnType<boolean> => {
    const data = await auth();

    if (!data || !data.user || !data.user.id) {
        redirect("/signin");
        return { error: "Not authenticated", success: false };
    }

    try {
        const res = await db
            .update(users)
            .set({ hasOnboarded: true })
            .where(eq(users.id, data.user.id))
            .returning({ hasOnboarded: users.hasOnboarded });

        if (res.length === 0 || !res[0]?.hasOnboarded) {
            return { success: false, data: false, error: "Failed to update user" };
        }

        return { success: true, data: res[0].hasOnboarded };
    } catch (e) {
        return { success: false, data: false, error: (e as Error).message };
    }
};

export const createSpace = async (
    input: string | FormData,
): ServerActionReturnType<number> => {
    const data = await auth();

    if (!data || !data.user) {
        redirect("/signin");
        return { error: "Not authenticated", success: false };
    }

    if (typeof input === "object") {
        input = (input as FormData).get("name") as string;
    }

    try {
        const resp = await db
            .insert(space)
            .values({ name: input, user: data.user.id, createdAt: new Date() });

        revalidatePath("/home");
        return { success: true, data: resp.meta.last_row_id };
    } catch (e: unknown) {
        const error = e as Error;
        if (
            error.message.includes("D1_ERROR: UNIQUE constraint failed: space.name")
        ) {
            return { success: false, data: 0, error: "Space already exists" };
        } else {
            return {
                success: false,
                data: 0,
                error: "Failed to create space with error: " + error.message,
            };
        }
    }
};

export const createMemory = async (
    content: string,
    likes: number,
    bookmarks: number
): ServerActionReturnType<number> => {
    const data = await auth();

    if (!data || !data.user) {
        redirect("/signin");
        return { error: "Not authenticated", success: false };
    }

    try {
        const resp = await db
            .insert(storedContent)
            .values({ content: content, likes: likes, bookmarks: bookmarks, user: data.user.id, createdAt: new Date() });

        revalidatePath("/memories");
        return { success: true, data: resp.meta.last_row_id };
    } catch (e: unknown) {
        const error = e as Error;
        return {
            success: false,
            data: 0,
            error: "Failed to create memory with error: " + error.message,
        };
    }
};

export const addLikeToMemory = async (memoryId: number): ServerActionReturnType<boolean> => {
    const data = await auth();

    if (!data || !data.user || !data.user.id) {
        redirect("/signin");
        return { error: "Not authenticated", success: false };
    }

    try {
        await db
            .update(storedContent)
            .set({ likes: sql<number>`likes + 1` })
            .where(eq(storedContent.id, memoryId));

        revalidatePath(`/memory/${memoryId}`);
        return { success: true, data: true };
    } catch (error) {
        return { success: false, data: false, error: (error as Error).message };
    }
};

export const addBookmarkToMemory = async (memoryId: number): ServerActionReturnType<boolean> => {
    const data = await auth();

    if (!data || !data.user || !data.user.id) {
        redirect("/signin");
        return { error: "Not authenticated", success: false };
    }

    try {
        await db
            .update(storedContent)
            .set({ bookmarks: sql<number>`bookmarks + 1` })
            .where(eq(storedContent.id, memoryId));

        revalidatePath(`/memory/${memoryId}`);
        return { success: true, data: true };
    } catch (error) {
        return { success: false, data: false, error: (error as Error).message };
    }
};