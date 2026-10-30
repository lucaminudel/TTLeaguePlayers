export interface FrontendDiagnostic {
    event_category: 'FRONTEND_API_CALL_ERROR' | 'FRONTEND_API_CALL_IRREGULAR';
    client_api_type: string;
    timestamp?: string;
    event_id?: string;
    operation?: string;
    event_name?: string;
    source?: Record<string, unknown>;
    exception?: Record<string, unknown>;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    page?: string;
    app_version?: string;
    deferred?: boolean;
}

export interface FrontendDiagnosticDelivery {
    success: boolean;
    status?: number;
}
