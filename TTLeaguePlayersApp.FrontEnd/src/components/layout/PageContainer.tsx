import React, { useEffect } from 'react';

interface PageContainerProps {
    /** The title of the page to be displayed at the top and in the browser tab */
    title: string;
    /** Primary content of the page */
    children?: React.ReactNode;
    /** Footer content, typically a button, which will be pinned to the bottom */
    footer?: React.ReactNode;
}

export const PageContainer: React.FC<PageContainerProps> = ({
    title,
    children,
    footer
}) => {

    useEffect(() => {
        document.title = title;
    }, [title]);

    return (
        <div className="flex-1 flex flex-col w-full text-center mt-12">
            {/* Top Section: Title & Content */}
            <div>
                <h2 className="text-4xl font-bold mb-4">{title}</h2>
                <div className="text-xl text-secondary-text leading-relaxed px-4">
                    {children}
                </div>
            </div>

            {/* Bottom Section: Footer/Action */}
            {footer && (
                <div className="w-full px-8 mt-auto pb-8">
                    {footer}
                </div>
            )}
        </div>
    );
};
