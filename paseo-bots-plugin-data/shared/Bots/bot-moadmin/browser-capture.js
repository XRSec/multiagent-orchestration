"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBrowserCaptureService = createBrowserCaptureService;
// The renderer measures the element in page CSS pixels, while capturePage
// takes device-independent pixels, so the page zoom scales the region.
function captureRect(value, zoomFactor) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    const coordinates = [record.x, record.y, record.width, record.height];
    if (!coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
        return null;
    }
    const [x, y, width, height] = coordinates.map((coordinate) => coordinate * zoomFactor);
    if (width <= 0 || height <= 0)
        return null;
    return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.round(width),
        height: Math.round(height),
    };
}
function copyPayload(value) {
    if (!value || typeof value !== "object")
        return { text: null, imageDataUrl: null };
    const record = value;
    return {
        text: typeof record.text === "string" && record.text.length > 0 ? record.text : null,
        imageDataUrl: typeof record.imageDataUrl === "string" && record.imageDataUrl.startsWith("data:image")
            ? record.imageDataUrl
            : null,
    };
}
function createBrowserCaptureService(dependencies) {
    return {
        async capture({ browserId, hostWebContentsId, rect }) {
            if (typeof browserId !== "string" || browserId.trim().length === 0)
                return null;
            const guest = dependencies.findGuest(browserId, hostWebContentsId);
            if (!guest || guest.isDestroyed())
                return null;
            const bounds = captureRect(rect, guest.getZoomFactor());
            if (!bounds)
                return null;
            try {
                const image = await guest.capturePage(bounds);
                return image.isEmpty() ? null : image.toDataURL();
            }
            catch (error) {
                dependencies.warn("capture-failed", { browserId, error });
                return null;
            }
        },
        async copy(payload) {
            const { text, imageDataUrl } = copyPayload(payload);
            let image = null;
            if (imageDataUrl) {
                try {
                    const decoded = dependencies.decodeImage(imageDataUrl);
                    if (!decoded.isEmpty())
                        image = decoded;
                }
                catch (error) {
                    dependencies.warn("image-decode-failed", { error });
                }
            }
            if (!text && !image)
                return false;
            await dependencies.clipboard.write({ text, image });
            return true;
        },
    };
}
//# sourceMappingURL=browser-capture.js.map