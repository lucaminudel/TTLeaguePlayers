import { apiFetch, GeneralApiError } from './api';
import { getConfig } from '../config/environment';
import type { FrontendDiagnostic, FrontendDiagnosticDelivery } from '../types/frontendDiagnostic';

export async function sendFrontendEvent(diagnostic: FrontendDiagnostic): Promise<FrontendDiagnosticDelivery> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeout = new Promise<FrontendDiagnosticDelivery>(resolve => {
            timeoutId = setTimeout(() => { resolve({ success: false }); }, 5000);
        });
        const send = apiFetch<unknown>(getConfig().ApiGateWay.ApiBaseUrl, '/frontend-events', {
            method: 'POST',
            body: JSON.stringify(diagnostic),
        }, 5000, 0).then((): FrontendDiagnosticDelivery => ({ success: true }));
        return await Promise.race([send, timeout]);
    } catch (error) {
        return { success: false, ...(error instanceof GeneralApiError && error.status !== undefined ? { status: error.status } : {}) };
    } finally {
        clearTimeout(timeoutId);
    }
}
