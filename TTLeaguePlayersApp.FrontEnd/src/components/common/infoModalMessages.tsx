import React from 'react';

// Info-modal GUIDs identify each message in local storage (see useInfoModalSuppression).
// Fixed for the life of each feature: changing one resurfaces the modal for every user who
// had opted out of it.
export const RATE_INFO_MODAL_GUID = '3732bda6-ce5f-407e-95d7-8f638cb333cc';
export const STANDINGS_INFO_MODAL_GUID = 'b61b3cb1-0513-4b46-960d-c8c423004c55';

export const DISPUTES_INFO_TITLE = 'Please be aware that:';

export const DisputesInfoBody: React.FC = () => (
    <div className="text-center space-y-2">
        <p className="text-base sm:text-lg">
            League officials are not responsible for managing disputes on Kudos awarded or received.
            <br/><br/>
        </p>
        <p className="text-base sm:text-lg">
            Match disputes must be directed as usual to the league officials.
            <br/><br/>
        </p>
    </div>
);
