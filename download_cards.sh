#!/bin/bash

# Script to download all Set card images
# Creates a directory to store the images

# Create output directory
OUTPUT_DIR="card_images"
mkdir -p "$OUTPUT_DIR"

# Define the possible values for each attribute
# Assuming 3 values for each attribute (0, 1, 2) as in the Set game
shapes=("oval" "squiggle" "diamond")
fillings=("filled" "clear" "lines")
colors=("red" "green" "purple")
numbers=("1" "2" "3")

# Base URL
BASE_URL="https://set.gganeles.com/RegCards"

# Counter for progress
total_count=0
success_count=0
failed_count=0

echo "Starting download of Set card images..."
echo "Output directory: $OUTPUT_DIR"
echo ""

# Iterate through all combinations
for shape in "${shapes[@]}"; do
    for filling in "${fillings[@]}"; do
        for color in "${colors[@]}"; do
            for number in "${numbers[@]}"; do
                # Construct filename and URL
                filename="${shape}_${filling}_${color}_${number}.png"
                url="${BASE_URL}/${filename}"
                output_path="${OUTPUT_DIR}/${filename}"
                
                total_count=$((total_count + 1))
                
                # Download with curl
                echo -n "Downloading $filename ... "
                if curl -f -s -o "$output_path" "$url"; then
                    echo "✓ Success"
                    success_count=$((success_count + 1))
                else
                    echo "✗ Failed"
                    failed_count=$((failed_count + 1))
                    # Remove failed download file
                    rm -f "$output_path"
                fi
            done
        done
    done
done

echo ""
echo "Download complete!"
echo "Total files: $total_count"
echo "Successful: $success_count"
echo "Failed: $failed_count"
