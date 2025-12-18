import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';

export const Home: React.FC = () => {
    return (
        <MobileLayout>
            <PageContainer
                title="Welcome"
                footer={
                    <Button fullWidth onClick={() => { console.log('Enter clicked'); }}>
                        Enter
                    </Button>
                }
            >
                <p>
                    Community of local leagues Table Tennis players.<br />
                    Starting from the CLTTL!
                </p>
            </PageContainer>
        </MobileLayout>
    );
};
