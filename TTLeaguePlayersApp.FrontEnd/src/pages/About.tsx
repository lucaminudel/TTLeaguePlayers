import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const About: React.FC = () => {
    // Simple anti-scraping: build the email address in JavaScript
    const user = 'contact_us';
    const domain = 'ttleagueplayers.uk';
    const email = `${user}@${domain}`;

    return (
        <MobileLayout>
            <PageContainer title="About">
                <div className="space-y-6">
                    <p className="text-lg font-medium text-main-text italic">
                        This App is created by Table Tennis players for Table Tennis players
                    </p>

                    <section className="mt-8">
                        <h2 className="text-2xl font-bold text-main-text mb-4">Contacts</h2>
                        <p className="text-main-text">
                            For technical support, questions, etc. email us at{' '}
                            <a
                                href={`mailto:${email}`}
                                className="text-action-accent hover:underline font-semibold"
                                data-testid="about-email-link"
                            >
                                {email}
                            </a>
                        </p>
                    </section>
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
