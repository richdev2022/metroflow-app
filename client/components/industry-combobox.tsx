import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { INDUSTRIES } from "@/lib/industries";

interface IndustryComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function IndustryCombobox({ value, onChange, disabled }: IndustryComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredIndustries = INDUSTRIES.filter((industry) =>
    industry.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = INDUSTRIES.some(
    (industry) => industry.toLowerCase() === search.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value
            ? value
            : "Select industry..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search industry..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandGroup>
              {filteredIndustries.map((industry) => (
                <CommandItem
                  key={industry}
                  value={industry}
                  onSelect={() => {
                    onChange(industry);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === industry ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {industry}
                </CommandItem>
              ))}
              
              {!exactMatch && search && (
                 <CommandItem
                  value={search}
                  onSelect={() => {
                    onChange(search);
                    setOpen(false);
                  }}
                  className="cursor-pointer font-medium text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create "{search}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
