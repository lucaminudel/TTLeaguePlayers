import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const AboutAndContactUs: React.FC = () => {
    // Simple anti-scraping: build the email address in JavaScript
    const user = 'contact_us';
    const domain = 'ttleagueplayers.uk';
    const email = `${user}@${domain}`;

    return (
        <MobileLayout>
            <PageContainer title="About & Contact Us">
                <div className="space-y-6">

                    <section className="mt-8">
                        <br/>
                        <h2 className="text-2xl font-bold text-main-text mb-4">Built by Players, for Players</h2>
                        <p className="text-main-text">
                            This <b>Unofficial</b> App 
                            operates independently of any local Table Tennis league organisations.
                            <br/>
                            <br/>
                            <b>Our core values are</b>:<br/>
                            - fair play, positive, inclusive behaviour<br />
                            - a modern digital experience<br />
                            - supporting local leagues  
                        </p>
                    </section>

                    <section className="mt-8">
                        <br/>
                        <h2 className="text-2xl font-bold text-main-text mb-4">Contact Us</h2>
                        <p className="text-main-text">
                            For technical support, general questions, or media enquiries, email us at:{' '}
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
