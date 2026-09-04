import React from 'react';

// Info-modal GUIDs identify each message in local storage (see useInfoModalSuppression).
// Fixed for the life of each feature: changing one resurfaces the modal for every user who
// had opted out of it.
export const RATE_INFO_MODAL_GUID = '3732bda6-ce5f-407e-95d7-8f638cb333cc';
export const STANDINGS_INFO_MODAL_GUID = 'b61b3cb1-0513-4b46-960d-c8c423004c55';
export const WEBSITE_INFO_MODAL_GUID = '8f2c5ac0-c61a-4c62-8592-fbef32af8949';

export const DISPUTES_INFO_TITLE = 'Match disputes & Kudos';
export const WEBSITE_INFO_TITLE = 'Please be aware that:';

export const DisputesInfoBody: React.FC = () => (
    <div className="text-center space-y-2">
        <p className="text-base sm:text-lg">
            Please direct match disputes to the league officials as usual. Refrain from awarding Kudos for any disputed match.
            <br/><br/>
        </p>
        <p className="text-base sm:text-lg">
            League officials are not responsible for resolving disputes related to Kudos.
            <br/><br/>
        </p>
    </div>
);

export const WebsiteInfoBody: React.FC = () => (
    <div className="text-center space-y-2">
        <p className="text-base sm:text-lg">
            All league official business and reporting remain centralised on the league website.
            <br/><br/>
        </p>
        <p className="text-base sm:text-lg">
            For official news, contacts, fixtures, results, standings, etc. refer to the league website.
            <br/><br/>
        </p>
    </div>
);
